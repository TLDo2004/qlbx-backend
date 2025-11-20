/**
 * Event Merger Service
 */

import RfidBufferService from './_rfidBufferService';
import CameraBufferService from './_cameraBufferService';
import { EventType, EventStatus } from '../models';
import { Vehicle } from '../models/vehicleModel';
import { RfidEtc } from '../models/rfidEtcModels';
import { IRfidEvent, ICameraEvent } from '../types/eventBuffer';
import EventCreationService, { EventCreationError } from './eventCreationService';

class EventMergerService {
  private static instance: EventMergerService;
  private isRunning: boolean = false;
  private mergeInterval: NodeJS.Timeout | null = null;
  private config = {
    mergeInterval: 5000, // Check for merges every 5 seconds
    deltaTimeThreshold: 8000, // 8 seconds max time difference (tolerate network/device latency)
    maxRetries: 3, // Max retries for failed merges
    retryDelay: 2000 // 2 seconds delay between retries
  };

  private constructor() {
    // Private constructor for singleton pattern
  }

  public static getInstance(): EventMergerService {
    if (!EventMergerService.instance) {
      EventMergerService.instance = new EventMergerService();
    }
    return EventMergerService.instance;
  }

  /**
   * Start the event merger service
   */
  public start(): void {
    if (this.isRunning) {
      console.log('Event Merger Service is already running');
      return;
    }

    console.log('Starting Event Merger Service...');
    this.isRunning = true;
    
    // Start the merge interval
    this.mergeInterval = setInterval(() => {
      this.performMerge();
    }, this.config.mergeInterval);

    console.log('Event Merger Service started successfully');
  }

  /**
   * Stop the event merger service
   */
  public stop(): void {
    if (!this.isRunning) {
      console.log('Event Merger Service is not running');
      return;
    }

    console.log('Stopping Event Merger Service...');
    this.isRunning = false;

    if (this.mergeInterval) {
      clearInterval(this.mergeInterval);
      this.mergeInterval = null;
    }

    console.log('Event Merger Service stopped successfully');
  }

  /**
   * Get service status
   */
  public getStatus(): { isRunning: boolean; config: any } {
    return {
      isRunning: this.isRunning,
      config: this.config
    };
  }

  /**
   * Update service configuration
   */
  public updateConfig(newConfig: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Event Merger Service config updated:', this.config);
  }

  /**
   * Perform merge operation - FIFO processing by timestamp
   */
  private async performMerge(): Promise<void> {
    try {
      const rfidBufferService = RfidBufferService.getInstance();
      const cameraBufferService = CameraBufferService.getInstance();

      // Get unprocessed events from both buffers
      const unprocessedRfidEvents = rfidBufferService.getAllUnprocessedRfidEvents();
      const unprocessedCameraEvents = cameraBufferService.getAllUnprocessedCameraEvents();

      console.log(`Merging: ${unprocessedRfidEvents.length} RFID events, ${unprocessedCameraEvents.length} Camera events`);

      // Combine all events and sort by timestamp (FIFO)
      const allEvents = this.combineAndSortEvents(unprocessedRfidEvents, unprocessedCameraEvents);

      // Process events in chronological order
      for (const event of allEvents) {
        if (event.type === 'rfid') {
          await this.processRfidEventFIFO(event.data as IRfidEvent, unprocessedCameraEvents);
        } else if (event.type === 'camera') {
          await this.processCameraEventFIFO(event.data as ICameraEvent, unprocessedRfidEvents);
        }
      }

      // Process expired events
      await this.processExpiredEvents();

      // Clean up all expired/processed events from buffers
      await this.cleanupBuffers();

    } catch (error) {
      console.error('Error during merge operation:', error);
    }
  }

  /**
   * Combine and sort events by timestamp (FIFO)
   */
  private combineAndSortEvents(rfidEvents: IRfidEvent[], cameraEvents: ICameraEvent[]): Array<{ type: 'rfid' | 'camera', data: IRfidEvent | ICameraEvent }> {
    const allEvents: Array<{ type: 'rfid' | 'camera', data: IRfidEvent | ICameraEvent }> = [];

    // Add RFID events
    rfidEvents.forEach(event => {
      allEvents.push({ type: 'rfid', data: event });
    });

    // Add Camera events
    cameraEvents.forEach(event => {
      allEvents.push({ type: 'camera', data: event });
    });

    // Sort by timestamp (FIFO)
    return allEvents.sort((a, b) => a.data.timestamp.getTime() - b.data.timestamp.getTime());
  }

  /**
   * Process RFID event in FIFO order
   */
  private async processRfidEventFIFO(rfidEvent: IRfidEvent, cameraEvents: ICameraEvent[]): Promise<void> {
    try {
      // Populate license_plate from database if not already set
      if (!rfidEvent.license_plate) {
        const vehicle = await this.lookupVehicleByRfid(rfidEvent.rfid_etc);
        if (vehicle) {
          rfidEvent.license_plate = vehicle.license_plate;
        }
      }

      // Check if event is expired
      if (this.isEventExpired(rfidEvent.timestamp)) {
        await this.createRfidOnlyEvent(rfidEvent);
        const rfidBufferService = RfidBufferService.getInstance();
        rfidBufferService.markRfidEventAsProcessed(rfidEvent.id); // Mark as processed first
        console.log(`Created RFID-only event for ${rfidEvent.license_plate}`);
        return;
      }

      // Find matching camera events
      const matchingCameraEvents = this.findMatchingCameraEvents(rfidEvent, cameraEvents);

      if (matchingCameraEvents.length > 0) {
        // Use the best match (closest timestamp)
        const bestMatch = this.selectBestMatch(rfidEvent, matchingCameraEvents);
        
        // Create merged event
        await this.createMergedEvent(rfidEvent, bestMatch);
        
        // Mark both events as processed (will be removed in cleanup)
        const rfidBufferService = RfidBufferService.getInstance();
        const cameraBufferService = CameraBufferService.getInstance();
        rfidBufferService.markRfidEventAsProcessed(rfidEvent.id);
        cameraBufferService.markCameraEventAsProcessed(bestMatch.id);
        
        console.log(`Merged RFID event ${rfidEvent.rfid_etc} with Camera event ${bestMatch.license_plate}`);
      }
    } catch (error) {
      console.error(`Error processing RFID event ${rfidEvent.rfid_etc}:`, error);
    }
  }

  /**
   * Process Camera event in FIFO order
   */
  private async processCameraEventFIFO(cameraEvent: ICameraEvent, rfidEvents: IRfidEvent[]): Promise<void> {
    try {
      // Check if event is expired
      if (this.isEventExpired(cameraEvent.timestamp)) {
        await this.createCameraOnlyEvent(cameraEvent);
        const cameraBufferService = CameraBufferService.getInstance();
        cameraBufferService.markCameraEventAsProcessed(cameraEvent.id); // Mark as processed first
        console.log(`Created Camera-only event for ${cameraEvent.license_plate}`);
        return;
      }

      // Do not block merging by image readiness; images can arrive later

      // Find matching RFID events (tolerate missing rfid license by lookup)
      const candidateRfidEvents = rfidEvents.filter((rfidEvent) => {
        if (rfidEvent.processed) return false;
        if (rfidEvent.gateId !== cameraEvent.gateId) return false;
        const timeDiff = Math.abs(cameraEvent.timestamp.getTime() - rfidEvent.timestamp.getTime());
        return timeDiff <= this.config.deltaTimeThreshold;
      });

      const matchingRfidEvents: IRfidEvent[] = [];
      for (const rfidEvent of candidateRfidEvents) {
        let rfidLicense = rfidEvent.license_plate;
        if (!rfidLicense) {
          try {
            const vehicle = await this.lookupVehicleByRfid(rfidEvent.rfid_etc);
            rfidLicense = vehicle?.license_plate;
          } catch (e) {
            // ignore lookup error
          }
        }
        if (rfidLicense && rfidLicense === cameraEvent.license_plate) {
          matchingRfidEvents.push(rfidEvent);
        }
      }

      if (matchingRfidEvents.length > 0) {
        // Use the best match (closest timestamp)
        const bestMatch = this.selectBestRfidMatch(cameraEvent, matchingRfidEvents);

        // Create merged event
        await this.createMergedEvent(bestMatch, cameraEvent);

  // Mark both events as processed (will be removed in cleanup)
        const rfidBufferService = RfidBufferService.getInstance();
        const cameraBufferService = CameraBufferService.getInstance();
        rfidBufferService.markRfidEventAsProcessed(bestMatch.id);
        cameraBufferService.markCameraEventAsProcessed(cameraEvent.id);
        
        console.log(`Merged Camera event ${cameraEvent.license_plate} with RFID event ${bestMatch.license_plate}`);
      }
      // If no matching RFID events found, wait for expiration to allow time for RFID events to arrive
    } catch (error) {
      console.error(`Error processing Camera event ${cameraEvent.license_plate}:`, error);
    }
  }

  /**
   * Check if event is expired (15 seconds)
   */
  private isEventExpired(timestamp: Date): boolean {
    const now = Date.now();
    const eventAge = now - timestamp.getTime();
    return eventAge > 15000; // 15 seconds
  }

  /**
   * Lookup vehicle by license plate
   */
  private async lookupVehicleByLicensePlate(license_plate: string): Promise<any | null> {
    try {
      // First try exact match
      let vehicle = await Vehicle.findOne({ license_plate: license_plate });

      if (!vehicle) {
        // Try with formatted license plate
        const formattedPlate = license_plate;
        vehicle = await Vehicle.findOne({ license_plate: formattedPlate });
      }

      if (!vehicle) {
        // Try to find by matching all possible formats in database
        const allVehicles = await Vehicle.find({});
        const formattedInput = license_plate;

        vehicle = allVehicles.find(v => {
          const formattedDbPlate = v.license_plate;
          const matches = formattedDbPlate === formattedInput;
          return matches;
        });
      }

      return vehicle || null; // Ensure we return null if vehicle is falsy
    } catch (error) {
      console.error('Error looking up vehicle by license plate:', error);
      return null;
    }
  }

  /**
   * Lookup RFID/ETC by rfid_etc
   */
  private async lookupRfidEtc(rfid_etc: string): Promise<{ rfidEtc: any | null, isExpired: boolean }> {
    try {
      const rfidEtc = await RfidEtc.findOne({ rfid_etc: rfid_etc });

      if (!rfidEtc) {
        return { rfidEtc: null, isExpired: false };
      }

      // Check if RFID is expired
      const isExpired = rfidEtc.expiration_date < new Date();

      return { rfidEtc, isExpired };
    } catch (error) {
      console.error('Error looking up RFID/ETC:', error);
      return { rfidEtc: null, isExpired: false };
    }
  }

  /**
   * Lookup vehicle by RFID/ETC
   */
  private async lookupVehicleByRfid(rfid_etc: string): Promise<any | null> {
    try {
      const vehicle = await Vehicle.findOne({ rfid_etc: rfid_etc });
      return vehicle;
    } catch (error) {
      console.error('Error looking up vehicle by RFID:', error);
      return null;
    }
  }

  /**
   * Determine event status based on event type and vehicle lookup
   */
  private async determineEventStatus(
    eventType: EventType,
    rfidEvent?: IRfidEvent,
    cameraEvent?: ICameraEvent
  ): Promise<{ status: EventStatus, vehicle_id?: string, license_plate?: string, failureReason?: string }> {

    // Case 1: Event has both RFID and Camera (MERGED)
    if (eventType === EventType.MERGED && rfidEvent && cameraEvent) {
      // Check both RFID and license plate in database
      const [rfidLookup, vehicleByRfid, vehicleByLicensePlate] = await Promise.all([
        this.lookupRfidEtc(rfidEvent.rfid_etc),
        this.lookupVehicleByRfid(rfidEvent.rfid_etc),
        this.lookupVehicleByLicensePlate(cameraEvent.license_plate)
      ]);

      const rfidExists = rfidLookup.rfidEtc !== null;
      const rfidExpired = rfidLookup.isExpired;
      const vehicleByRfidExists = vehicleByRfid !== null;
      const vehicleByLicensePlateExists = vehicleByLicensePlate !== null;

      // Both exist in database and RFID is not expired => accepted
      if (rfidExists && vehicleByRfidExists && vehicleByLicensePlateExists && !rfidExpired) {
        // Check if license plates match (format both before comparing)
        const formattedRfidPlate = vehicleByRfid.license_plate;
        const formattedCameraPlate = cameraEvent.license_plate;

        if (formattedRfidPlate === formattedCameraPlate) {
          // Use vehicleByRfid as primary
          const vehicleId = vehicleByRfid._id.toString();
          return {
            status: EventStatus.ACCEPTED,
            vehicle_id: vehicleId,
            license_plate: vehicleByRfid?.license_plate
          };
        } else {
          // License plates don't match => rejected
          return {
            status: EventStatus.REJECTED,
            failureReason: 'License plate mismatch between RFID and Camera'
          };
        }
      }

      // Both exist but RFID is expired => etc_error
      if (rfidExists && vehicleByRfidExists && vehicleByLicensePlateExists && rfidExpired) {
        return {
          status: EventStatus.ETC_ERROR,
          failureReason: 'RFID detected but expired',
          vehicle_id: vehicleByRfid?._id?.toString(),
          license_plate: vehicleByRfid?.license_plate
        };
      }

      // Only RFID not in database => etc_error
      if (rfidExists && !vehicleByRfidExists && vehicleByLicensePlateExists) {
        return {
          status: EventStatus.ETC_ERROR,
          failureReason: 'RFID not found in database but vehicle exists'
        };
      }

      // Only license plate not in database => rejected
      if (rfidExists && vehicleByRfidExists && !vehicleByLicensePlateExists && !rfidExpired) {
        return {
          status: EventStatus.REJECTED,
          failureReason: 'License plate not found in database'
        };
      }

      // Both not in database => rejected (new vehicle)
      if (rfidExists && !vehicleByRfidExists && !vehicleByLicensePlateExists) {
        return {
          status: EventStatus.REJECTED,
          failureReason: 'New vehicle - both RFID and license plate not found'
        };
      }
    }

    // Case 2: RFID only
    if (eventType === EventType.RFID_ONLY && rfidEvent) {
      const [rfidLookup, vehicleByRfid] = await Promise.all([
        this.lookupRfidEtc(rfidEvent.rfid_etc),
        this.lookupVehicleByRfid(rfidEvent.rfid_etc)
      ]);

      const rfidExists = rfidLookup.rfidEtc !== null;
      const rfidExpired = rfidLookup.isExpired;
      const vehicleByRfidExists = vehicleByRfid !== null;

      // RFID exists and not expired => accepted
      if (rfidExists && vehicleByRfidExists && !rfidExpired) {
        return {
          status: EventStatus.ACCEPTED,
          vehicle_id: vehicleByRfid?._id?.toString(),
          license_plate: vehicleByRfid?.license_plate // Get license plate from vehicle
        };
      }

      // RFID exists but expired => etc_error
      if (rfidExists && vehicleByRfidExists && rfidExpired) {
        return {
          status: EventStatus.ETC_ERROR,
          failureReason: 'RFID detected but expired',
          vehicle_id: vehicleByRfid?._id?.toString(),
          license_plate: vehicleByRfid?.license_plate // Get license plate from vehicle
        };
      }

      // RFID not in database => rejected (new vehicle)
      if (rfidExists && !vehicleByRfidExists) {
        return {
          status: EventStatus.REJECTED,
          failureReason: 'New vehicle - RFID not found in database'
        };
      }
    }

    // Case 3: Camera only (license plate only)
    if (eventType === EventType.CAMERA_ONLY && cameraEvent) {
      const vehicleByLicensePlate = await this.lookupVehicleByLicensePlate(cameraEvent.license_plate);
      const vehicleByLicensePlateExists = vehicleByLicensePlate !== null && vehicleByLicensePlate !== undefined;

      // License plate exists => no_etc
      if (vehicleByLicensePlateExists) {
        return {
          status: EventStatus.NO_ETC,
          failureReason: 'No RFID/ETC detected but vehicle exists',
          vehicle_id: vehicleByLicensePlate?._id?.toString()
        };
      }

      // License plate not in database => rejected (new vehicle)
      return {
        status: EventStatus.REJECTED,
        failureReason: 'New vehicle - license plate not found in database'
      };
    }

    // Default case
    return {
      status: EventStatus.REJECTED,
      failureReason: 'Unknown event type or missing data'
    };
  }
  /**
   * Clean up all expired/processed events from buffers
   * Only removes events that have been saved to database (processed = true)
   */
  private async cleanupBuffers(): Promise<void> {
    const rfidBufferService = RfidBufferService.getInstance();
    const cameraBufferService = CameraBufferService.getInstance();

    // Only remove processed events (those already saved to database)
    const rfidRemoved = rfidBufferService.removeProcessedEvents();
    const cameraRemoved = cameraBufferService.removeProcessedEvents();

    if (rfidRemoved > 0 || cameraRemoved > 0) {
      console.log(`Buffer cleanup: Removed ${rfidRemoved} processed RFID events, ${cameraRemoved} processed Camera events`);
    }
  }

  /**
   * Process expired events
   */
  private async processExpiredEvents(): Promise<void> {
    try {
      const rfidBufferService = RfidBufferService.getInstance();
      const cameraBufferService = CameraBufferService.getInstance();

      // Process expired RFID events
      const rfidEvents = rfidBufferService.getAllUnprocessedRfidEvents();
      for (const rfidEvent of rfidEvents) {
        if (this.isEventExpired(rfidEvent.timestamp)) {
          try {
            await this.createRfidOnlyEvent(rfidEvent);
            rfidBufferService.markRfidEventAsProcessed(rfidEvent.id); // Mark as processed first
            console.log(`Processed expired RFID event ${rfidEvent.rfid_etc} - ${rfidEvent.license_plate}`);
          } catch (error) {
            console.error(`Error processing expired RFID event ${rfidEvent.rfid_etc} - ${rfidEvent.license_plate}:`, error);
          }
        }
      }

      // Process expired Camera events
      const cameraEvents = cameraBufferService.getAllUnprocessedCameraEvents();
      for (const cameraEvent of cameraEvents) {
        if (this.isEventExpired(cameraEvent.timestamp)) {
          try {
            await this.createCameraOnlyEvent(cameraEvent);
            cameraBufferService.markCameraEventAsProcessed(cameraEvent.id); // Mark as processed first
            console.log(`Processed expired Camera event ${cameraEvent.license_plate}`);
          } catch (error) {
            console.error(`Error processing expired Camera event ${cameraEvent.license_plate}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error in processExpiredEvents:', error);
    }
  }

  // Matching RFID events for a Camera event is now inlined in processCameraEventFIFO to support RFID license lookup

  /**
   * Select the best matching RFID event
   */
  private selectBestRfidMatch(cameraEvent: ICameraEvent, matchingEvents: IRfidEvent[]): IRfidEvent {
    // Sort by time difference (closest first)
    return matchingEvents.sort((a, b) => {
      const timeDiffA = Math.abs(cameraEvent.timestamp.getTime() - a.timestamp.getTime());
      const timeDiffB = Math.abs(cameraEvent.timestamp.getTime() - b.timestamp.getTime());
      return timeDiffA - timeDiffB;
    })[0];
  }


  /**
   * Find matching camera events for a RFID event
   */
  private findMatchingCameraEvents(rfidEvent: IRfidEvent, cameraEvents: ICameraEvent[]): ICameraEvent[] {
    return cameraEvents.filter(cameraEvent => {
      // Check if camera event is not processed
      if (cameraEvent.processed) return false;

      // Do not require imagesReady; image may arrive later

      // Check if same gate
      if (rfidEvent.gateId !== cameraEvent.gateId) return false;

      // Check if rfid has license plate
      if (!rfidEvent.license_plate) return false;

      // Check if license plate matches
      const formattedRfidPlate = rfidEvent.license_plate;
      const formattedCameraPlate = cameraEvent.license_plate;
      if (formattedRfidPlate !== formattedCameraPlate) {
        return false;
      }

      // Check time difference
      const timeDiff = Math.abs(rfidEvent.timestamp.getTime() - cameraEvent.timestamp.getTime());
      if (timeDiff > this.config.deltaTimeThreshold) return false;

      return true;
    });
  }

  /**
   * Select the best matching camera event
   */
  private selectBestMatch(rfidEvent: IRfidEvent, matchingEvents: ICameraEvent[]): ICameraEvent {
    // Sort by time difference (closest first)
    return matchingEvents.sort((a, b) => {
      const timeDiffA = Math.abs(rfidEvent.timestamp.getTime() - a.timestamp.getTime());
      const timeDiffB = Math.abs(rfidEvent.timestamp.getTime() - b.timestamp.getTime());
      return timeDiffA - timeDiffB;
    })[0];
  }

  /**
   * Create a merged event
   */
  private async createMergedEvent(rfidEvent: IRfidEvent, cameraEvent: ICameraEvent): Promise<void> {
    try {
      // Determine event status
      const { status, vehicle_id, license_plate, failureReason } = await this.determineEventStatus(
        EventType.MERGED,
        rfidEvent,
        cameraEvent
      );

      const cameraEventData: any = {
        license_plate: cameraEvent.license_plate,
        timestamp: cameraEvent.timestamp,
        gateId: cameraEvent.gateId
      };
      if (cameraEvent.imageUrl) {
        cameraEventData.imageUrl = cameraEvent.imageUrl;
      }

      const mergedTimestamp = new Date(Math.min(rfidEvent.timestamp.getTime(), cameraEvent.timestamp.getTime()));

      const mergedLicense =
        license_plate || cameraEvent.license_plate || rfidEvent.license_plate || 'UNKNOWN';

      const { event: created } = await EventCreationService.createEvent(
        {
          eventType: EventType.MERGED,
          status,
          failureReason,
          license_plate: mergedLicense,
          vehicle_id,
          gateId: rfidEvent.gateId,
          timestamp: mergedTimestamp,
          rfidEvent: {
            rfid_etc: rfidEvent.rfid_etc,
            timestamp: rfidEvent.timestamp,
            gateId: rfidEvent.gateId
          },
          cameraEvent: cameraEventData
        },
        { allowUnknownVehicle: true }
      );
      // Link camera buffer event to persisted Event id for later image update
      try {
        const cameraBufferService = CameraBufferService.getInstance();
        cameraBufferService.setPersistedEventId(cameraEvent.id, created._id.toString());
      } catch (_) { }
      console.log(`Created merged event with status: ${status}`);
    } catch (error) {
      console.error('Error creating merged event:', error);
      if (error instanceof EventCreationError) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * Create a RFID-only event
   */
  private async createRfidOnlyEvent(rfidEvent: IRfidEvent): Promise<void> {
    try {
      // Determine event status
      const { status, vehicle_id, license_plate, failureReason } = await this.determineEventStatus(
        EventType.RFID_ONLY,
        rfidEvent,
        undefined
      );

      await EventCreationService.createEvent(
        {
          eventType: EventType.RFID_ONLY,
          status,
          failureReason,
          license_plate: license_plate || rfidEvent.license_plate || 'UNKNOWN',
          vehicle_id,
          gateId: rfidEvent.gateId,
          timestamp: rfidEvent.timestamp,
          rfidEvent: {
            rfid_etc: rfidEvent.rfid_etc,
            timestamp: rfidEvent.timestamp,
            gateId: rfidEvent.gateId
          }
        },
        { allowUnknownVehicle: true }
      );
      console.log(`Created RFID-only event with status: ${status}`);
    } catch (error) {
      console.error('Error creating RFID-only event:', error);
      throw error;
    }
  }

  /**
   * Create a camera-only event
   */
  private async createCameraOnlyEvent(cameraEvent: ICameraEvent): Promise<void> {
    try {
      // Determine event status
      const { status, vehicle_id, failureReason } = await this.determineEventStatus(
        EventType.CAMERA_ONLY,
        undefined,
        cameraEvent
      );

      const cameraEventData: any = {
        license_plate: cameraEvent.license_plate,
        timestamp: cameraEvent.timestamp,
        gateId: cameraEvent.gateId
      };
      if (cameraEvent.imageUrl) {
        cameraEventData.imageUrl = cameraEvent.imageUrl;
      }

      const { event: created } = await EventCreationService.createEvent(
        {
          eventType: EventType.CAMERA_ONLY,
          status,
          failureReason,
          license_plate: cameraEvent.license_plate,
          vehicle_id,
          gateId: cameraEvent.gateId,
          timestamp: cameraEvent.timestamp,
          cameraEvent: cameraEventData
        },
        { allowUnknownVehicle: true }
      );
      try {
        const cameraBufferService = CameraBufferService.getInstance();
        cameraBufferService.setPersistedEventId(cameraEvent.id, created._id.toString());
      } catch (_) { }
      console.log(`Created Camera-only event with status: ${status}`);
    } catch (error) {
      console.error('Error creating Camera-only event:', error);
      throw error;
    }
  }

  /**
   * Manual merge operation (for testing)
   */
  public async manualMerge(): Promise<{ merged: number; rfidOnly: number; cameraOnly: number }> {
    console.log('Performing manual merge...');
    
    const rfidBufferService = RfidBufferService.getInstance();
    const cameraBufferService = CameraBufferService.getInstance();

    const unprocessedRfidEvents = rfidBufferService.getAllUnprocessedRfidEvents();
    const unprocessedCameraEvents = cameraBufferService.getAllUnprocessedCameraEvents();

    let mergedCount = 0;
    let rfidOnlyCount = 0;
    let cameraOnlyCount = 0;

    // Process RFID events
    for (const rfidEvent of unprocessedRfidEvents) {
      const matchingCameraEvents = this.findMatchingCameraEvents(rfidEvent, unprocessedCameraEvents);
      
      if (matchingCameraEvents.length > 0) {
        const bestMatch = this.selectBestMatch(rfidEvent, matchingCameraEvents);
        await this.createMergedEvent(rfidEvent, bestMatch);
        rfidBufferService.markRfidEventAsProcessed(rfidEvent.id);
        cameraBufferService.markCameraEventAsProcessed(bestMatch.id);
        mergedCount++;
      } else {
        await this.createRfidOnlyEvent(rfidEvent);
        rfidBufferService.markRfidEventAsProcessed(rfidEvent.id);
        rfidOnlyCount++;
      }
    }

    // Process remaining camera events
    for (const cameraEvent of unprocessedCameraEvents) {
      if (!cameraEvent.processed) {
        await this.createCameraOnlyEvent(cameraEvent);
        cameraBufferService.markCameraEventAsProcessed(cameraEvent.id);
        cameraOnlyCount++;
      }
    }

    // Clean up buffers after manual merge
    await this.cleanupBuffers();

    console.log(`Manual merge completed: ${mergedCount} merged, ${rfidOnlyCount} RFID-only, ${cameraOnlyCount} camera-only`);
    
    return { merged: mergedCount, rfidOnly: rfidOnlyCount, cameraOnly: cameraOnlyCount };
  }
}

export default EventMergerService;
