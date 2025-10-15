import mongoose, { Document, Schema } from 'mongoose';

// Enum for camera gate status
export enum CameraGateStatus {
    GATE_IN = 'gate_in',
    GATE_OUT = 'gate_out'
}

// Interface for Camera document
export interface ICamera extends Document {
    ipAddress: string;
    username: string;
    password: string;
    gate: CameraGateStatus;
    createdAt: Date;
    updatedAt: Date;
}

// Camera Schema
const CameraSchema = new Schema<ICamera>({
    ipAddress: {
        type: String,
        required: true,
        unique: true
    },
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    gate: {
        type: String,
        required: true,
        enum: Object.values(CameraGateStatus)
    }
}, {
    timestamps: true,
    collection: 'camera'
});

export const Camera = mongoose.model<ICamera>('camera', CameraSchema, 'camera');

