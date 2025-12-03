import mongoose, { Document, Schema } from 'mongoose';

export enum FeeRecordStatus {
    PAID = 'paid',
    PENDING = 'pending',
    FAILED = 'failed'
}

export interface IFeeRecord extends Document {
    parking_session_id?: mongoose.Schema.Types.ObjectId;
    vehicle_id: mongoose.Schema.Types.ObjectId;
    fee_rule_id: mongoose.Schema.Types.ObjectId;
    amount: number;
    status: FeeRecordStatus;
    paid_at?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const FeeRecordSchema = new Schema<IFeeRecord>({
    parking_session_id: {
        type: Schema.Types.ObjectId,
        ref: 'parking_session',
        required: false
    },
    vehicle_id: {
        type: Schema.Types.ObjectId,
        ref: 'vehicle',
        required: true
    },
    fee_rule_id: {
        type: Schema.Types.ObjectId,
        ref: 'fee_rule',
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: Object.values(FeeRecordStatus),
        default: FeeRecordStatus.PENDING
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    paid_at: {
        type: Date,
        required: false
    }
}, {
    timestamps: true,
    _id: true,
    collection: 'fee_record'
});

FeeRecordSchema.index({ vehicle_id: 1, fee_rule_id: 1 });

export const FeeRecord = mongoose.model<IFeeRecord>('fee_record', FeeRecordSchema, 'fee_record');


