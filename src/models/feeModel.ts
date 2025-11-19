import mongoose, { Document, Schema } from 'mongoose';
import { VehicleType } from './vehicleModel';

export enum FeeType {
    PASSING = 'passing',
    PARKING = 'parking'
}

export interface IFee extends Document {
    fee_type: FeeType;
    fee_name: string;
    vehicle_type?: VehicleType;
    amount: number;
    createdAt: Date;
    updatedAt: Date;
}

const FeeSchema = new Schema<IFee>({
    fee_type: {
        type: String,
        required: true,
        trim: true,
        enum: Object.values(FeeType)
    },
    fee_name: {
        type: String,
        required: true,
        trim: true
    },
    vehicle_type: {
        type: String,
        enum: Object.values(VehicleType),
        required: false
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    }
}, {
    timestamps: true,
    _id: true,
    collection: 'fee'
});

FeeSchema.index({ fee_type: 1, vehicle_type: 1 }, { unique: true });

export const Fee = mongoose.model<IFee>('fee', FeeSchema, 'fee');


