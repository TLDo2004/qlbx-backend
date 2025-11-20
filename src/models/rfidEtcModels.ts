import mongoose, { Document, Schema } from 'mongoose';

// Interface for RFID/ETC document
export interface IRfidEtc extends Document {
    rfid_etc: string;
    expiration_date: Date;
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
RfidEtcSchema.index({ expiration_date: 1 });

export const RfidEtc = mongoose.model<IRfidEtc>('rfid_etc', RfidEtcSchema, 'rfid_etc');
