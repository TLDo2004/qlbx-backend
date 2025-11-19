import mongoose, { Document, Schema } from 'mongoose';

export interface IAccount extends Document {
    vehicle_id: mongoose.Schema.Types.ObjectId;
    balance: number;
    is_active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>({
    vehicle_id: {
        type: Schema.Types.ObjectId,
        ref: 'vehicle',
        required: true,
        unique: true
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
    collection: 'account'
});

AccountSchema.index({ vehicle_id: 1 });

export const Account = mongoose.model<IAccount>('account', AccountSchema, 'account');


