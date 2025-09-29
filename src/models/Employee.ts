import mongoose, { Document, Schema } from 'mongoose';

// Interface for Employee document
export interface IEmployee extends Document {
  uid: string;
  fullName: string;
  phone: string;
  roleId: mongoose.Schema.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Employee Schema
const EmployeeSchema = new Schema<IEmployee>({
  uid: {
    type: String,
    required: true,
    unique: true
  },
  fullName: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Role'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  _id: true
});

export const Employee = mongoose.model<IEmployee>('Employee', EmployeeSchema);
