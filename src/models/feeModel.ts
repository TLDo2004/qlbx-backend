import mongoose, { Document, Schema } from 'mongoose';
import { VehicleType } from './vehicleModel';

export interface IFee extends Document {
    fee_type: string;
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
        trim: true
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

FeeSchema.index(
    { fee_type: 1, vehicle_type: 1 },
    {
        unique: true,
        partialFilterExpression: { vehicle_type: { $exists: true } }
    }
);
FeeSchema.index(
    { fee_type: 1 },
    {
        unique: true,
        partialFilterExpression: { vehicle_type: { $exists: false } }
    }
);

export const Fee = mongoose.model<IFee>('fee', FeeSchema, 'fee');


