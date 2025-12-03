import mongoose, { Document, Schema } from 'mongoose';

// Enum for parking session status
export enum ParkingSessionStatus {
    OPEN = 'open',      // Vehicle has entered but not exited
    CLOSED = 'closed',  // Vehicle has exited
    ERROR = 'error'     // Session has error
}

export interface IParkingSession extends Document {
    vehicle_id: mongoose.Schema.Types.ObjectId;
    entry_event_id: mongoose.Schema.Types.ObjectId;
    exit_event_id?: mongoose.Schema.Types.ObjectId;
    entry_time: Date;
    exit_time?: Date;
    status: ParkingSessionStatus;
    createdAt: Date;
    updatedAt: Date;
}

const ParkingSessionSchema = new Schema<IParkingSession>({
    vehicle_id: {
        type: Schema.Types.ObjectId,
        ref: 'vehicle',
        required: true,
        index: true
    },
    entry_event_id: {
        type: Schema.Types.ObjectId,
        ref: 'event',
        required: true,
        index: true
    },
    exit_event_id: {
        type: Schema.Types.ObjectId,
        ref: 'event',
        required: false,
        index: true
    },
    entry_time: {
        type: Date,
        required: true,
        index: true
    },
    exit_time: {
        type: Date,
        required: false,
        index: true
    },
    status: {
        type: String,
        required: true,
        enum: Object.values(ParkingSessionStatus),
        default: ParkingSessionStatus.OPEN,
        index: true
    }
}, {
    timestamps: true,
    _id: true,
    collection: 'parking_session'
});

// Indexes for better query performance
ParkingSessionSchema.index({ vehicle_id: 1, status: 1 }); // Find open sessions by vehicle
ParkingSessionSchema.index({ entry_time: -1 }); // Most recent entries first
ParkingSessionSchema.index({ status: 1, entry_time: -1 }); // Open sessions by entry time
ParkingSessionSchema.index({ entry_event_id: 1 }, { unique: true }); // One session per entry event

export const ParkingSession = mongoose.model<IParkingSession>('parking_session', ParkingSessionSchema, 'parking_session');

