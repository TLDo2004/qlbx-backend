/**
 * Types and interfaces for Event Buffer System
 * Handles RFID and Camera event buffering and merging
 */

// RFID Event interface
export interface IRfidEvent {
  id: string;
  timestamp: Date;
  rfid_etc: string;
  license_plate?: string; // Will be populated from vehicle lookup
  gateId: string; // e.g., "gate_01_in", "gate_01_out"
  processed: boolean;
}

// Camera Event interface  
export interface ICameraEvent {
  id: string;
  timestamp: Date;
  license_plate: string;
  gateId: string; // e.g., "gate_01_in", "gate_01_out"
  imageData?: string; // base64 image data (optional)
  processed: boolean;
}

// Merged Event interface
export interface IMergedEvent {
  id: string;
  rfidEvent: IRfidEvent;
  cameraEvent: ICameraEvent;
  deltaTime: number; // milliseconds between RFID and camera timestamps
  mergedAt: Date;
}

// Buffer configuration interface
export interface IBufferConfig {
  deltaTimeThreshold: number; // milliseconds - max time difference to consider events as matching
  maxBufferSize: number; // maximum number of events to keep in each buffer
  cleanupInterval: number; // milliseconds - how often to clean up expired events
}

// Buffer status interface
export interface IBufferStatus {
  rfidBufferSize: number;
  cameraBufferSize: number;
  mergedEventsCount: number;
  lastCleanup: Date;
  config: IBufferConfig;
}
