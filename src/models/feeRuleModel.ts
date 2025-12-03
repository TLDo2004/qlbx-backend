import mongoose, { Document, Schema } from 'mongoose';

export interface IFeeRule extends Document {
    name: string;
    min_seat: number;
    max_seat: number;
    amount: number;
    is_active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const FeeRuleSchema = new Schema<IFeeRule>({
    name: {
        type: String,
        required: true,
        trim: true
    },
    min_seat: {
        type: Number,
        required: true,
        min: 0
    },
    max_seat: {
        type: Number,
        required: true,
        min: 0
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    is_active: {
        type: Boolean,
        required: true,
        default: true
    }
}, {
    timestamps: true,
    _id: true,
    collection: 'fee_rule'
});

FeeRuleSchema.index({ name: 1, min_seat: 1, max_seat: 1 }, { unique: true });

export const FeeRule = mongoose.model<IFeeRule>('fee_rule', FeeRuleSchema, 'fee_rule');


