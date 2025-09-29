import mongoose, { Document, Schema } from 'mongoose';

// Interface for Role document
export interface IRole extends Document {
  roleId: mongoose.Schema.Types.ObjectId;
  roleName: string;
  permissionId: mongoose.Schema.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

// Role Schema
const RoleSchema = new Schema<IRole>({
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true,
    index: true
  },
  roleName: {
    type: String, 
    required: true,
    unique: true
  },
  permissionId: {
    type: [mongoose.Schema.Types.ObjectId],
    required: true,
    ref: 'Permission'
  }
}, {
  timestamps: true
});

export const Role = mongoose.model<IRole>('Role', RoleSchema);
