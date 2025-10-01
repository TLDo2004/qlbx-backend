import mongoose, { Document, Schema } from 'mongoose';

// Interface for Permission document
export interface IPermission extends Document {
    permissionName: string;
    createdAt: Date;
    updatedAt: Date;
}

// Permission Schema
const PermissionSchema = new Schema<IPermission>({
    permissionName: {
        type: String,
        required: true
    },
}, {
    timestamps: true,
    collection: 'permission'
});

export const Permission = mongoose.model<IPermission>('permission', PermissionSchema, 'permission');
