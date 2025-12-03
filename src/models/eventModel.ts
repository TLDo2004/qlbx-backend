import mongoose, { Document, Schema } from 'mongoose';

// Enum for event types
export enum EventType {
    MERGED = 'merged',           // RFID + Camera events merged
    RFID_ONLY = 'rfid_only',     // Only RFID event (no camera match)
    CAMERA_ONLY = 'camera_only'  // Only Camera event (no RFID match)
}

// Enum for event status
export enum EventStatus {
    ACCEPTED = 'passed',         // Vehicle is accepted to enter the station
    REJECTED = 'blocked',        // New vehicle that is not existing in the system
    ETC_ERROR = 'rfid_error',    // RFID/ETC detected but error (eg. expired, invalid, ...)
    NO_ETC = 'no_rfid',          // RFID/ETC not detected
    FAILED = 'failed',           // Event processing failed
    UNVERIFIED = 'unverified',   // Event not yet verified
}

// Enum for gate ID
export enum GateId {
    GATE_IN = 'gate_in',
    GATE_OUT = 'gate_out'
}

// Enum for direction
export enum Direction {
    IN = 'in',
    OUT = 'out'
}
// Interface for RFID event data
export interface IRfidEventData {
    rfid_etc: string;
    timestamp: Date;
    gateId: GateId;
}

// Interface for Camera event data
export interface ICameraEventData {
    license_plate: string;
    timestamp: Date;
    gateId: GateId;
    imageUrl?: string; // URL to image stored in cloud (e.g., Cloudinary)
}

// Interface for Event document
export interface IEvent extends Document {
    // Basic event info
    eventType: EventType;
    status: EventStatus;
    timestamp: Date;
    
    // Vehicle info (from license_plate lookup)
    license_plate: string;
    vehicle_id?: mongoose.Schema.Types.ObjectId; // Reference to vehicle document
    
    // Gate info
    gateId: GateId;
    direction: Direction;
    
    // Event data
    rfidEvent?: IRfidEventData;
    cameraEvent?: ICameraEventData;
     
    // Processing info
    failureReason?: string; // reason for failure if status is failed
    
    // Metadata
    createdAt: Date;
    updatedAt: Date;
}

// Event Schema
const EventSchema = new Schema<IEvent>({
    eventType: {
        type: String,
        required: true,
        enum: Object.values(EventType)
    },
    status: {
        type: String,
        required: true,
        enum: Object.values(EventStatus),
        default: EventStatus.REJECTED
    },
    timestamp: {
        type: Date,
        required: true,
        index: true
    },
    license_plate: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        index: true
    },
    vehicle_id: {
        type: Schema.Types.ObjectId,
        ref: 'vehicle',
        required: false
    },
    gateId: {
        type: String,
        required: true,
        enum: Object.values(GateId),
        index: true
    },
    direction: {
        type: String,
        required: true,
        enum: Object.values(Direction),
        index: true
    },
    rfidEvent: {
        rfid_etc: {
            type: String,
            required: false
        },
        timestamp: {
            type: Date,
            required: false
        },
        gateId: {
            type: String,
            required: false,
            enum: Object.values(GateId)
        }
    },
    cameraEvent: {
        license_plate: {
            type: String,
            required: false
        },
        timestamp: {
            type: Date,
            required: false
        },
        gateId: {
            type: String,
            required: false,
            enum: Object.values(GateId)
        },
        imageUrl: {
            type: String,
            required: false
        }
    },
    failureReason: {
        type: String,
        required: false
    }
}, {
    timestamps: true,
    _id: true,
    collection: 'events'
});

// Indexes for better query performance
EventSchema.index({ timestamp: -1 }); // Most recent events first
EventSchema.index({ license_plate: 1, timestamp: -1 }); // Events by license plate
EventSchema.index({ gateId: 1, timestamp: -1 }); // Events by gate
EventSchema.index({ eventType: 1, status: 1 }); // Events by type and status
EventSchema.index({ status: 1, timestamp: -1 }); // Pending events
EventSchema.index({ createdAt: -1 }); // Events by creation time

export const Event = mongoose.model<IEvent>('event', EventSchema, 'events');
