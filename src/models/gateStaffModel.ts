import mongoose, { Document, Schema } from 'mongoose';

// Interface for Gate Staff document
export interface IGateStaff extends Document {
    uid: string;
    fullName: string;
    phone: string;
    urlImage?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// Gate Staff Schema
const GateStaffSchema = new Schema<IGateStaff>({
    uid: {
        type: String,
        required: true,
        unique: true
    },
    fullName: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    urlImage: {
        type: String,
        required: false
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    _id: true,
    collection: 'gate_staff'
});

export const GateStaff = mongoose.model<IGateStaff>('gate_staff', GateStaffSchema, 'gate_staff');
 