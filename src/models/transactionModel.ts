import mongoose, { Document, Schema } from 'mongoose';

export enum TransactionType {
    CASH_IN = 'cash_in',
    CASH_OUT = 'cash_out'
}

export enum TransactionSource {
    BANK = 'bank',
    CASH = 'cash',
    EWALLET = 'eWallet',
    CARD = 'card'
}

export interface ITransaction extends Document {
    rfid_etc_id: mongoose.Schema.Types.ObjectId;
    amount: number;
    type: TransactionType;
    source: TransactionSource;
    reference_code?: string;
    perform_by?: mongoose.Schema.Types.ObjectId;
    note?: string;
    balance_before: number;
    balance_after: number;
    createdAt: Date;
    updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>({
    rfid_etc_id: {
        type: Schema.Types.ObjectId,
        ref: 'rfid_etc',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    type: {
        type: String,
        enum: Object.values(TransactionType),
        required: true
    },
    source: {
        type: String,
        enum: Object.values(TransactionSource),
        required: true
    },
    reference_code: {
        type: String,
        trim: true
    },
    perform_by: {
        type: Schema.Types.ObjectId,
        ref: 'employee'
    },
    note: {
        type: String,
        trim: true,
        maxlength: 2000
    },
    balance_before: {
        type: Number,
        required: true
    },
    balance_after: {
        type: Number,
        required: true
    }
}, {
    timestamps: true,
    _id: true,
    collection: 'transaction'
});

TransactionSchema.index({ rfid_etc_id: 1, createdAt: -1 });
TransactionSchema.index({ reference_code: 1 }, { sparse: true, unique: true });

export const Transaction = mongoose.model<ITransaction>('transaction', TransactionSchema, 'transaction');


