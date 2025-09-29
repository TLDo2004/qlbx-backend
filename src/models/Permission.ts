import mongoose, { Document, Schema } from 'mongoose';

// Interface for Permission document
export interface IPermission extends Document {
  permissionId: mongoose.Schema.Types.ObjectId;
  permissionName: string;
  createdAt: Date;
  updatedAt: Date;
}

// Permission Schema
const PermissionSchema = new Schema<IPermission>({
  permissionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true,
    index: true
  },
  permissionName: {
    type: String,
    required: true
  },
}, {
  timestamps: true
});

export const Permission = mongoose.model<IPermission>('Permission', PermissionSchema);
