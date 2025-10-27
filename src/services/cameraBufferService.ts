/**
 * Camera Buffer Service
 * Manages Camera events in memory buffer for event merging
 */

import { ICameraEvent, IBufferConfig, IBufferStatus } from '../types/eventBuffer';

class CameraBufferService {
  private static instance: CameraBufferService;
  private cameraBuffer: Map<string, ICameraEvent> = new Map();
  private config: IBufferConfig;
  private lastCleanup: Date = new Date();

  private constructor() {
    // Default configuration
    this.config = {
      deltaTimeThreshold: 5000, // 5 seconds
      maxBufferSize: 1000, // Maximum 1000 events per buffer
      cleanupInterval: 30000 // Cleanup every 30 seconds
    };

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): CameraBufferService {
    if (!CameraBufferService.instance) {
      CameraBufferService.instance = new CameraBufferService();
    }
    return CameraBufferService.instance;
  }

  /**
   * Add Camera event to buffer
   */
  public addCameraEvent(eventData: Omit<ICameraEvent, 'id' | 'processed'>): string {
    const eventId = this.generateEventId();
    
    const cameraEvent: ICameraEvent = {
      id: eventId,
      ...eventData,
      processed: false
    };

    // Add to buffer
    this.cameraBuffer.set(eventId, cameraEvent);

    // Check buffer size limit
    if (this.cameraBuffer.size > this.config.maxBufferSize) {
      this.cleanupOldestEvents();
    }

    console.log(`[Camera Buffer] Added event: ${eventId}, Gate: ${cameraEvent.gateId}, License: ${cameraEvent.license_plate}`);
    
    return eventId;
  }

  /**
   * Get Camera events by gate ID
   */
  public getCameraEventsByGate(gateId: string): ICameraEvent[] {
    const events: ICameraEvent[] = [];
    
    for (const [, event] of this.cameraBuffer) {
      if (event.gateId === gateId && !event.processed) {
        events.push(event);
      }
    }

    // Sort by timestamp (oldest first)
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get all unprocessed Camera events
   */
  public getAllUnprocessedCameraEvents(): ICameraEvent[] {
    const events: ICameraEvent[] = [];
    
    for (const [, event] of this.cameraBuffer) {
      if (!event.processed) {
        events.push(event);
      }
    }

    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get Camera events by license plate
   */
  public getCameraEventsByLicensePlate(licensePlate: string): ICameraEvent[] {
    const events: ICameraEvent[] = [];
    
    for (const [, event] of this.cameraBuffer) {
      if (event.license_plate === licensePlate && !event.processed) {
        events.push(event);
      }
    }

    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Mark Camera event as processed
   */
  public markCameraEventAsProcessed(eventId: string): boolean {
    const event = this.cameraBuffer.get(eventId);
    if (event) {
      event.processed = true;
      console.log(`[Camera Buffer] Marked event as processed: ${eventId}`);
      return true;
    }
    return false;
  }

  /**
   * Get buffer status
   */
  public getBufferStatus(): IBufferStatus {
    return {
      rfidBufferSize: 0, // Will be updated when we integrate with RFID buffer
      cameraBufferSize: this.cameraBuffer.size,
      mergedEventsCount: 0, // Will be implemented when we add merging logic
      lastCleanup: this.lastCleanup,
      config: { ...this.config }
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<IBufferConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(`[Camera Buffer] Configuration updated:`, this.config);
  }

  /**
   * Clean up expired events
   */
  public cleanupExpiredEvents(): number {
    const now = Date.now();
    const maxAge = 15000; // 15 seconds - fixed expired time
    let cleanedCount = 0;

    for (const [id, event] of this.cameraBuffer) {
      const eventAge = now - event.timestamp.getTime();
      if (eventAge > maxAge) {
        this.cameraBuffer.delete(id);
        cleanedCount++;
      }
    }

    this.lastCleanup = new Date();
    
    if (cleanedCount > 0) {
      console.log(`[Camera Buffer] Cleaned up ${cleanedCount} expired events`);
    }

    return cleanedCount;
  }

  /**
   * Remove specific event from buffer
   */
  public removeCameraEvent(eventId: string): boolean {
    const existed = this.cameraBuffer.has(eventId);
    if (existed) {
      this.cameraBuffer.delete(eventId);
      console.log(`[Camera Buffer] Removed event: ${eventId}`);
    }
    return existed;
  }

  /**
   * Remove only processed events (already saved to database)
   */
  public removeProcessedEvents(): number {
    let removedCount = 0;

    for (const [id, event] of this.cameraBuffer) {
      if (event.processed) {
        this.cameraBuffer.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[Camera Buffer] Removed ${removedCount} processed events`);
    }

    return removedCount;
  }

  /**
   * Remove expired or processed events
   */
  public removeExpiredOrProcessedEvents(): number {
    let removedCount = 0;
    const now = Date.now();
    const maxAge = 15000; // 15 seconds

    for (const [id, event] of this.cameraBuffer) {
      const eventAge = now - event.timestamp.getTime();
      if (eventAge > maxAge || event.processed) {
        this.cameraBuffer.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[Camera Buffer] Removed ${removedCount} expired/processed events`);
    }

    return removedCount;
  }

  /**
   * Clear all events (for testing)
   */
  public clearAllEvents(): void {
    this.cameraBuffer.clear();
    console.log(`[Camera Buffer] All events cleared`);
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `cam_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up oldest events when buffer is full
   */
  private cleanupOldestEvents(): void {
    const events = Array.from(this.cameraBuffer.values());
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    const toRemove = events.slice(0, Math.floor(this.config.maxBufferSize * 0.1)); // Remove 10% of oldest events
    
    for (const event of toRemove) {
      this.cameraBuffer.delete(event.id);
    }
    
    console.log(`[Camera Buffer] Cleaned up ${toRemove.length} oldest events due to buffer size limit`);
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredEvents();
    }, this.config.cleanupInterval);
  }
}

export default CameraBufferService;
