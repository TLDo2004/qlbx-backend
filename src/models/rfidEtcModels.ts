import mongoose, { Document, Schema } from 'mongoose';

// Enum for RFID/ETC status
export enum RfidEtcStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive'
}

// Interface for RFID/ETC document
export interface IRfidEtc extends Document {
    rfid_etc: string;
    expiration_date: Date;
    status: RfidEtcStatus;
    balance: number;
    is_active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// RFID/ETC Schema
const RfidEtcSchema = new Schema<IRfidEtc>({
    rfid_etc: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    expiration_date: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: Object.values(RfidEtcStatus),
        default: RfidEtcStatus.ACTIVE
    },
    balance: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    is_active: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    _id: true,
    collection: 'rfid_etc'
});

// Index for better query performance
RfidEtcSchema.index({ status: 1 });
RfidEtcSchema.index({ expiration_date: 1 });

export const RfidEtc = mongoose.model<IRfidEtc>('rfid_etc', RfidEtcSchema, 'rfid_etc');
