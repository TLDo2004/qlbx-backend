import express from 'express';
import { Camera, CameraGateStatus } from '../../models';
import { internalError, created, badRequest, success, notFound } from '../../utils';
import { gateStaffAuth } from '../../middleware/index';
import crypto from 'crypto';

const cameraRouter = express.Router();

// Interface for Camera request
interface ICameraRequest extends express.Request {
  body: {
    ipAddress: string;
    username: string;
    password: string;
    gate: CameraGateStatus;
  };
}

// Interface for Camera update request
interface ICameraUpdateRequest extends express.Request {
  body: {
    ipAddress?: string;
    username?: string;
    password?: string;
  };
}

// Helper function to encrypt password
const encryptPassword = (password: string): string => {
  const algorithm = 'aes-256-cbc';
  const secretKey = process.env.ENCRYPTION_KEY || 'your-secret-key-here-32-characters-long';
  
  // Create a hash of the secret key to ensure it's 32 bytes
  const key = crypto.createHash('sha256').update(secretKey).digest();
  
  // Generate a random IV
  const iv = crypto.randomBytes(16);
  
  // Create cipher
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  // Encrypt the password
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Combine IV and encrypted data
  return iv.toString('hex') + ':' + encrypted;
};

// Helper function to decrypt password (new format only)
const decryptPassword = (encryptedPassword: string): string => {
  // Validate input
  if (!encryptedPassword || typeof encryptedPassword !== 'string') {
    throw new Error('Invalid encrypted password: input is null, undefined, or not a string');
  }

  const algorithm = 'aes-256-cbc';
  const secretKey = process.env.ENCRYPTION_KEY || 'your-secret-key-here-32-characters-long';
  
  // Create a hash of the secret key to ensure it's 32 bytes
  const key = crypto.createHash('sha256').update(secretKey).digest();
  
  // Split IV and encrypted data (format: IV:encrypted_data)
  const parts = encryptedPassword.split(':');
  
  // Validate format
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted password format: expected "IV:encrypted_data"');
  }
  
  const [ivHex, encrypted] = parts;
  
  // Validate IV and encrypted data
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted password: missing IV or encrypted data');
  }
  
  try {
    const iv = Buffer.from(ivHex, 'hex');
    
    // Create decipher
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    
    // Decrypt the password
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// GET /camera - Get all cameras with pagination
cameraRouter.get('/', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const gate = req.query.gate as string; // Optional filter by gate

    // Validate pagination parameters
    if (page < 1) {
      badRequest(res, 'Page number must be greater than 0');
      return;
    }

    if (limit < 1 || limit > 100) {
      badRequest(res, 'Limit must be between 1 and 100');
      return;
    }

    // Calculate skip value
    const skip = (page - 1) * limit;

    // Build filter object
    const filter: any = {};
    if (gate) {
      filter.gate = gate;
    }

    // Get total count for pagination info
    const totalCameras = await Camera.countDocuments(filter);
    const totalPages = Math.ceil(totalCameras / limit);

    // Get cameras with pagination
    const cameras = await Camera.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Transform data to exclude password
    const transformedCameras = cameras.map(camera => ({
      _id: camera._id,
      ipAddress: camera.ipAddress,
      username: camera.username,
      gate: camera.gate,
      createdAt: camera.createdAt,
      updatedAt: camera.updatedAt
    }));

    success(res, {
      cameras: transformedCameras,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalCameras,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    }, 'Cameras retrieved successfully');
  } catch (error: any) {
    console.error('Error fetching cameras:', error);
    internalError(res, 'Failed to fetch cameras');
  }
});

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

    // Validate gate enum
    if (!Object.values(CameraGateStatus).includes(gate)) {
      badRequest(res, `Invalid gate. Must be one of: ${Object.values(CameraGateStatus).join(', ')}`);
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

// GET /camera/:id/password - Get decrypted password for a specific camera
cameraRouter.get('/:id/password', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      badRequest(res, 'Invalid camera ID format');
      return;
    }

    // Find camera by ID
    const camera = await Camera.findById(id);

    if (!camera) {
      notFound(res, 'Camera not found');
      return;
    }

    // Decrypt password
    let decryptedPassword = '';
    try {
      // Check if password exists and is not null/undefined
      if (!camera.password) {
        throw new Error('Camera password is null or undefined');
      }
      
      decryptedPassword = decryptPassword(camera.password);
    } catch (error) {
      console.error('Error decrypting password for camera:', id, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown decryption error';
      badRequest(res, `Failed to decrypt password: ${errorMessage}`);
      return;
    }

    // Return only the decrypted password
    success(res, {
      cameraId: camera._id,
      ipAddress: camera.ipAddress,
      username: camera.username,
      password: decryptedPassword
    }, 'Password retrieved successfully');
  } catch (error: any) {
    console.error('Error fetching camera password:', error);
    internalError(res, 'Failed to fetch camera password');
  }
});

// PUT /camera/:id - Update a camera
cameraRouter.put('/:id', gateStaffAuth, async (req: ICameraUpdateRequest, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { ipAddress, username, password } = req.body;

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      badRequest(res, 'Invalid camera ID format');
      return;
    }

    // Check if at least one field is provided for update
    if (!ipAddress && !username && !password) {
      badRequest(res, 'At least one field (ipAddress, username, password) must be provided for update');
      return;
    }

    // Validate IP address format if provided
    if (ipAddress) {
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(ipAddress)) {
        badRequest(res, 'Invalid IP address format');
        return;
      }
    }

    // Find the camera first
    const existingCamera = await Camera.findById(id);
    if (!existingCamera) {
      notFound(res, 'Camera not found');
      return;
    }

    // Prepare update object
    const updateData: any = {};
    
    if (ipAddress) {
      updateData.ipAddress = ipAddress;
    }
    
    if (username) {
      updateData.username = username;
    }
    
    if (password) {
      // Encrypt the new password
      updateData.password = encryptPassword(password);
    }

    // Update the camera
    const updatedCamera = await Camera.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedCamera) {
      internalError(res, 'Failed to update camera');
      return;
    }

    // Return updated camera data without password
    const cameraData = {
      _id: updatedCamera._id,
      ipAddress: updatedCamera.ipAddress,
      username: updatedCamera.username,
      gate: updatedCamera.gate,
      createdAt: updatedCamera.createdAt,
      updatedAt: updatedCamera.updatedAt
    };

    success(res, cameraData, 'Camera updated successfully');
  } catch (error: any) {
    console.error('Error updating camera:', error);

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

    internalError(res, 'Failed to update camera');
  }
});

// DELETE /camera/:id - Delete a camera
cameraRouter.delete('/:id', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      badRequest(res, 'Invalid camera ID format');
      return;
    }

    // Find and delete camera
    const deletedCamera = await Camera.findByIdAndDelete(id);

    if (!deletedCamera) {
      notFound(res, 'Camera not found');
      return;
    }

    // Return success response with deleted camera info (without password)
    success(res, {
      deletedCamera: {
        _id: deletedCamera._id,
        ipAddress: deletedCamera.ipAddress,
        username: deletedCamera.username,
        gate: deletedCamera.gate,
        createdAt: deletedCamera.createdAt,
        updatedAt: deletedCamera.updatedAt
      }
    }, 'Camera deleted successfully');
  } catch (error: any) {
    console.error('Error deleting camera:', error);
    internalError(res, 'Failed to delete camera');
  }
});

// Export decrypt function for use in other modules
export { decryptPassword };

export default cameraRouter;
