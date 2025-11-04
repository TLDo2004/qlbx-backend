/**
 * Event Merger Service
 * Tự động merge events từ RFID và Camera buffers
 */

import RfidBufferService from './_rfidBufferService';
import CameraBufferService from './_cameraBufferService';
import { Event, EventType } from '../models';
import { IRfidEvent, ICameraEvent } from '../types/eventBuffer';

class EventMergerService {
  private static instance: EventMergerService;
  private isRunning: boolean = false;
  private mergeInterval: NodeJS.Timeout | null = null;
  private config = {
    mergeInterval: 5000, // Check for merges every 5 seconds
    deltaTimeThreshold: 10000, // 10 seconds max time difference
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
   * Perform merge operation
   */
  private async performMerge(): Promise<void> {
    try {
      const rfidBufferService = RfidBufferService.getInstance();
      const cameraBufferService = CameraBufferService.getInstance();

      // Get unprocessed events from both buffers
      const unprocessedRfidEvents = rfidBufferService.getAllUnprocessedRfidEvents();
      const unprocessedCameraEvents = cameraBufferService.getAllUnprocessedCameraEvents();

      console.log(`Merging: ${unprocessedRfidEvents.length} RFID events, ${unprocessedCameraEvents.length} Camera events`);

      // Process RFID events
      for (const rfidEvent of unprocessedRfidEvents) {
        await this.processRfidEvent(rfidEvent, unprocessedCameraEvents);
      }

      // Process remaining camera events (those without RFID matches)
      for (const cameraEvent of unprocessedCameraEvents) {
        if (!cameraEvent.processed) {
          await this.processCameraOnlyEvent(cameraEvent);
        }
      }

    } catch (error) {
      console.error('Error during merge operation:', error);
    }
  }

  /**
   * Process a single RFID event
   */
  private async processRfidEvent(rfidEvent: IRfidEvent, cameraEvents: ICameraEvent[]): Promise<void> {
    try {
      // Find matching camera events
      const matchingCameraEvents = this.findMatchingCameraEvents(rfidEvent, cameraEvents);

      if (matchingCameraEvents.length > 0) {
        // Use the best match (closest timestamp)
        const bestMatch = this.selectBestMatch(rfidEvent, matchingCameraEvents);
        
        // Create merged event
        await this.createMergedEvent(rfidEvent, bestMatch);
        
        // Mark both events as processed
        const rfidBufferService = RfidBufferService.getInstance();
        const cameraBufferService = CameraBufferService.getInstance();
        rfidBufferService.markRfidEventAsProcessed(rfidEvent.id);
        cameraBufferService.markCameraEventAsProcessed(bestMatch.id);
        
        console.log(`Merged RFID event ${rfidEvent.id} with Camera event ${bestMatch.id}`);
      } else {
        // No camera match found, create RFID-only event
        await this.createRfidOnlyEvent(rfidEvent);
        
        // Mark RFID event as processed
        const rfidBufferService = RfidBufferService.getInstance();
        rfidBufferService.markRfidEventAsProcessed(rfidEvent.id);
        
        console.log(`Created RFID-only event for ${rfidEvent.id}`);
      }
    } catch (error) {
      console.error(`Error processing RFID event ${rfidEvent.id}:`, error);
    }
  }

  /**
   * Process a camera-only event
   */
  private async processCameraOnlyEvent(cameraEvent: ICameraEvent): Promise<void> {
    try {
      // Create camera-only event
      await this.createCameraOnlyEvent(cameraEvent);
      
      // Mark camera event as processed
      const cameraBufferService = CameraBufferService.getInstance();
      cameraBufferService.markCameraEventAsProcessed(cameraEvent.id);
      
      console.log(`Created Camera-only event for ${cameraEvent.id}`);
    } catch (error) {
      console.error(`Error processing Camera event ${cameraEvent.id}:`, error);
    }
  }

  /**
   * Find matching camera events for a RFID event
   */
  private findMatchingCameraEvents(rfidEvent: IRfidEvent, cameraEvents: ICameraEvent[]): ICameraEvent[] {
    return cameraEvents.filter(cameraEvent => {
      // Check if camera event is not processed
      if (cameraEvent.processed) return false;

      // Check if same gate
      if (rfidEvent.gateId !== cameraEvent.gateId) return false;

      // Check if license plate matches (if available in RFID event)
      if (rfidEvent.license_plate && rfidEvent.license_plate !== cameraEvent.license_plate) {
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
      const eventData = {
        eventType: EventType.MERGED,
        license_plate: cameraEvent.license_plate,
        gateId: rfidEvent.gateId,
        timestamp: new Date(), // Current time
        rfidEvent: {
          rfid_etc: rfidEvent.rfid_etc,
          timestamp: rfidEvent.timestamp,
          gateId: rfidEvent.gateId
        },
        cameraEvent: {
          license_plate: cameraEvent.license_plate,
          timestamp: cameraEvent.timestamp,
          gateId: cameraEvent.gateId,
          imageData: cameraEvent.imageData
        }
      };

      await Event.create(eventData);
    } catch (error) {
      console.error('Error creating merged event:', error);
      throw error;
    }
  }

  /**
   * Create a RFID-only event
   */
  private async createRfidOnlyEvent(rfidEvent: IRfidEvent): Promise<void> {
    try {
      const eventData = {
        eventType: EventType.RFID_ONLY,
        license_plate: rfidEvent.license_plate || 'UNKNOWN',
        gateId: rfidEvent.gateId,
        timestamp: new Date(),
        rfidEvent: {
          rfid_etc: rfidEvent.rfid_etc,
          timestamp: rfidEvent.timestamp,
          gateId: rfidEvent.gateId
        }
      };

      await Event.create(eventData);
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
      const eventData = {
        eventType: EventType.CAMERA_ONLY,
        license_plate: cameraEvent.license_plate,
        gateId: cameraEvent.gateId,
        timestamp: new Date(),
        cameraEvent: {
          license_plate: cameraEvent.license_plate,
          timestamp: cameraEvent.timestamp,
          gateId: cameraEvent.gateId,
          imageData: cameraEvent.imageData
        }
      };

      await Event.create(eventData);
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

    console.log(`Manual merge completed: ${mergedCount} merged, ${rfidOnlyCount} RFID-only, ${cameraOnlyCount} camera-only`);
    
    return { merged: mergedCount, rfidOnly: rfidOnlyCount, cameraOnly: cameraOnlyCount };
  }
}

export default EventMergerService;
