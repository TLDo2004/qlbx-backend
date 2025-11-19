import mongoose, { Document, Schema } from 'mongoose';

export interface IBusCompany extends Document {
    name: string;
    tax_code: string;
    address: string;
    phone: string;
    vehicles: mongoose.Schema.Types.ObjectId[];
    contract_start: Date;
    contract_end: Date;
    is_active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const BusCompanySchema = new Schema<IBusCompany>({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    tax_code: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        sparse: true
    },
    address: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    vehicles: {
        type: [{
            type: Schema.Types.ObjectId,
            ref: 'vehicle'
        }],
        default: []
    },
    contract_start: {
        type: Date,
        required: true
    },
    contract_end: {
        type: Date,
        required: true
    },
    is_active: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    _id: true,
    collection: 'bus_company'
});

export const BusCompany = mongoose.model<IBusCompany>('bus_company', BusCompanySchema, 'bus_company');


