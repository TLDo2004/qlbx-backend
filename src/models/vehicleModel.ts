import mongoose, { Document, Schema } from 'mongoose';

// Enum for vehicle types
export enum VehicleType {
    CONTRACT = 'contract',
    TRANSFER = 'transfer',
    ROUTE = 'route',
    VISITOR = 'visitor',
    INTERNAL = 'internal'
}

// Enum for vehicle gate status
export enum VehicleGateStatus {
    GATE_IN = 'gate_in',
    GATE_OUT = 'gate_out',
    INACTIVE = 'inactive'
}

// Interface for Vehicle document
export interface IVehicle extends Document {
    license_plate: string;
    vehicle_group?: string;
    vehicle_type?: VehicleType;
    company?: mongoose.Schema.Types.ObjectId;
    rfid_etc?: string;
    gate: VehicleGateStatus;
    createdAt: Date;
    updatedAt: Date;
}

// Vehicle Schema
const VehicleSchema = new Schema<IVehicle>({
    license_plate: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    vehicle_group: {
        type: String,
        required: false,
        trim: true
    },
    vehicle_type: {
        type: String,
        required: false,
        enum: Object.values(VehicleType)
    },
    company: {
        type: Schema.Types.ObjectId,
        ref: 'bus_company',
        required: false
    },
    rfid_etc: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
        trim: true
    },
    gate: {
        type: String,
        required: true,
        enum: Object.values(VehicleGateStatus),
        default: VehicleGateStatus.GATE_OUT
    }
}, {
    timestamps: true,
    _id: true,
    collection: 'vehicle'
});

// Index for better query performance
VehicleSchema.index({ gate: 1 });
VehicleSchema.index({ vehicle_type: 1 });

export const Vehicle = mongoose.model<IVehicle>('vehicle', VehicleSchema, 'vehicle');
