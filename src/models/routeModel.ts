import mongoose, { Document, Schema } from 'mongoose';

export interface IRoute extends Document {
    name: string;
    origin: string;
    destination: string;
    createdAt: Date;
    updatedAt: Date;
}

const RouteSchema = new Schema<IRoute>({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    origin: {
        type: String,
        required: true,
        trim: true
    },
    destination: {
        type: String,
        required: true,
        trim: true
    }
}, {
    timestamps: true,
    _id: true,
    collection: 'route'
});

export const Route = mongoose.model<IRoute>('route', RouteSchema, 'route');


