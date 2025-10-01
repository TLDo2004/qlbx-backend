import mongoose, { Document, Schema } from 'mongoose';

// Interface for Role document
export interface IRole extends Document {
    roleName: string;
    permissionId: mongoose.Schema.Types.ObjectId[]; // Array of ObjectIds to match actual data
    createdAt: Date;
    updatedAt: Date;
}

// Role Schema
const RoleSchema = new Schema<IRole>({
    roleName: {
        type: String,
        required: true,
        unique: true
    },
    permissionId: {
        type: [mongoose.Schema.Types.ObjectId], // Array of ObjectIds to match actual data
        required: true,
        ref: 'permission'
    }
}, {
    timestamps: true,
    collection: 'role'
});

export const Role = mongoose.model<IRole>('role', RoleSchema, 'role');
