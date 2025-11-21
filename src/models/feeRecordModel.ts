import mongoose, { Document, Schema } from 'mongoose';

export interface IFeeRecord extends Document {
    vehicle_id: mongoose.Schema.Types.ObjectId;
    fee_id: mongoose.Schema.Types.ObjectId;
    transaction_id?: mongoose.Schema.Types.ObjectId;
    timestamp: Date;
    amount: number;
    is_paid: boolean;
    paid_at?: Date;
    parking_time?: number; // Thời gian đỗ xe (phút)
    createdAt: Date;
    updatedAt: Date;
}

const FeeRecordSchema = new Schema<IFeeRecord>({
    vehicle_id: {
        type: Schema.Types.ObjectId,
        ref: 'vehicle',
        required: true
    },
    fee_id: {
        type: Schema.Types.ObjectId,
        ref: 'fee',
        required: true
    },
    transaction_id: {
        type: Schema.Types.ObjectId,
        ref: 'transaction',
        required: false
    },
    timestamp: {
        type: Date,
        required: true,
        default: Date.now
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    is_paid: {
        type: Boolean,
        default: false
    },
    paid_at: {
        type: Date
    },
    parking_time: {
        type: Number,
        required: false,
        min: 0
    }
}, {
    timestamps: true,
    _id: true,
    collection: 'fee_record'
});

FeeRecordSchema.index({ vehicle_id: 1, timestamp: -1 });

export const FeeRecord = mongoose.model<IFeeRecord>('fee_record', FeeRecordSchema, 'fee_record');


