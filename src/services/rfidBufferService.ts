/**
 * RFID Buffer Service
 * Manages RFID events in memory buffer for event merging
 */

import { IRfidEvent, IBufferConfig, IBufferStatus } from '../types/eventBuffer';

class RfidBufferService {
  private static instance: RfidBufferService;
  private rfidBuffer: Map<string, IRfidEvent> = new Map();
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
  public static getInstance(): RfidBufferService {
    if (!RfidBufferService.instance) {
      RfidBufferService.instance = new RfidBufferService();
    }
    return RfidBufferService.instance;
  }

  /**
   * Add RFID event to buffer
   */
  public addRfidEvent(eventData: Omit<IRfidEvent, 'id' | 'processed'>): string {
    const eventId = this.generateEventId();
    
    const rfidEvent: IRfidEvent = {
      id: eventId,
      ...eventData,
      processed: false
    };

    // Add to buffer
    this.rfidBuffer.set(eventId, rfidEvent);

    // Check buffer size limit
    if (this.rfidBuffer.size > this.config.maxBufferSize) {
      this.cleanupOldestEvents();
    }

    console.log(`[RFID Buffer] Added event: ${eventId}, Gate: ${rfidEvent.gateId}, RFID: ${rfidEvent.rfid_etc}`);
    
    return eventId;
  }

  /**
   * Get RFID events by gate ID
   */
  public getRfidEventsByGate(gateId: string): IRfidEvent[] {
    const events: IRfidEvent[] = [];
    
    for (const [, event] of this.rfidBuffer) {
      if (event.gateId === gateId && !event.processed) {
        events.push(event);
      }
    }

    // Sort by timestamp (oldest first)
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get all unprocessed RFID events
   */
  public getAllUnprocessedRfidEvents(): IRfidEvent[] {
    const events: IRfidEvent[] = [];
    
    for (const [, event] of this.rfidBuffer) {
      if (!event.processed) {
        events.push(event);
      }
    }

    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Mark RFID event as processed
   */
  public markRfidEventAsProcessed(eventId: string): boolean {
    const event = this.rfidBuffer.get(eventId);
    if (event) {
      event.processed = true;
      console.log(`[RFID Buffer] Marked event as processed: ${eventId}`);
      return true;
    }
    return false;
  }

  /**
   * Get buffer status
   */
  public getBufferStatus(): IBufferStatus {
    return {
      rfidBufferSize: this.rfidBuffer.size,
      cameraBufferSize: 0, // Will be implemented when we add camera buffer
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
    console.log(`[RFID Buffer] Configuration updated:`, this.config);
  }

  /**
   * Clean up expired events
   */
  public cleanupExpiredEvents(): number {
    const now = Date.now();
    const maxAge = 15000; // 15 seconds - fixed expired time
    let cleanedCount = 0;

    for (const [id, event] of this.rfidBuffer) {
      const eventAge = now - event.timestamp.getTime();
      if (eventAge > maxAge) {
        this.rfidBuffer.delete(id);
        cleanedCount++;
      }
    }

    this.lastCleanup = new Date();
    
    if (cleanedCount > 0) {
      console.log(`[RFID Buffer] Cleaned up ${cleanedCount} expired events`);
    }

    return cleanedCount;
  }

  /**
   * Remove specific event from buffer
   */
  public removeRfidEvent(eventId: string): boolean {
    const existed = this.rfidBuffer.has(eventId);
    if (existed) {
      this.rfidBuffer.delete(eventId);
      console.log(`[RFID Buffer] Removed event: ${eventId}`);
    }
    return existed;
  }

  /**
   * Remove only processed events (already saved to database)
   */
  public removeProcessedEvents(): number {
    let removedCount = 0;

    for (const [id, event] of this.rfidBuffer) {
      if (event.processed) {
        this.rfidBuffer.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[RFID Buffer] Removed ${removedCount} processed events`);
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

    for (const [id, event] of this.rfidBuffer) {
      const eventAge = now - event.timestamp.getTime();
      if (eventAge > maxAge || event.processed) {
        this.rfidBuffer.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[RFID Buffer] Removed ${removedCount} expired/processed events`);
    }

    return removedCount;
  }

  /**
   * Clear all events (for testing)
   */
  public clearAllEvents(): void {
    this.rfidBuffer.clear();
    console.log(`[RFID Buffer] All events cleared`);
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `rfid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up oldest events when buffer is full
   */
  private cleanupOldestEvents(): void {
    const events = Array.from(this.rfidBuffer.values());
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    const toRemove = events.slice(0, Math.floor(this.config.maxBufferSize * 0.1)); // Remove 10% of oldest events
    
    for (const event of toRemove) {
      this.rfidBuffer.delete(event.id);
    }
    
    console.log(`[RFID Buffer] Cleaned up ${toRemove.length} oldest events due to buffer size limit`);
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

export default RfidBufferService;
