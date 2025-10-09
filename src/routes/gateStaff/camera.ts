import express from 'express';
import { Camera } from '../../models';
import { internalError, created, badRequest, success } from '../../utils';
import { gateStaffAuth } from '../../middleware/index';
import crypto from 'crypto';

const cameraRouter = express.Router();

// Interface for Camera request
interface ICameraRequest extends express.Request {
  body: {
    ipAddress: string;
    username: string;
    password: string;
    gate: string;
  };
}

// Helper function to encrypt password
const encryptPassword = (password: string): string => {
  const algorithm = 'aes-256-cbc';
  const secretKey = process.env.ENCRYPTION_KEY || 'your-secret-key-here-32-characters-long';
  
  const cipher = crypto.createCipher(algorithm, secretKey);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return encrypted;
};

// POST /camera - Create a new camera
cameraRouter.post('/', gateStaffAuth, async (req: ICameraRequest, res: express.Response): Promise<void> => {
  try {
    const { ipAddress, username, password, gate } = req.body;

    // Validate required fields
    if (!ipAddress || !username || !password || !gate) {
      badRequest(res, 'Missing required fields: ipAddress, username, password, gate');
      return;
    }

    // Validate IP address format
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ipAddress)) {
      badRequest(res, 'Invalid IP address format');
      return;
    }

    // Encrypt password before saving
    const encryptedPassword = encryptPassword(password);

    // Create camera record
    const camera = await Camera.create({
      ipAddress,
      username,
      password: encryptedPassword,
      gate
    });

    // Return camera data without password
    const cameraData = {
      _id: camera._id,
      ipAddress: camera.ipAddress,
      username: camera.username,
      gate: camera.gate,
      createdAt: camera.createdAt,
      updatedAt: camera.updatedAt
    };

    created(res, cameraData, 'Camera created successfully');
  } catch (error: any) {
    console.error('Error creating camera:', error);

    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      badRequest(res, 'Camera with this IP address already exists');
      return;
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err: any) => err.message);
      badRequest(res, `Validation error: ${errors.join(', ')}`);
      return;
    }

    internalError(res, 'Failed to create camera');
  }
});

// GET /camera - Get all cameras
cameraRouter.get('/', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const cameras = await Camera.find();
    success(res, cameras, 'Cameras fetched successfully');
  } catch (error: any) {
    internalError(res, 'Failed to fetch cameras');
  }
});

export default cameraRouter;
