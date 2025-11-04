/**
 * Buffer Management API Routes
 * For testing and monitoring RFID/Camera buffer system
 */

import express from 'express';
import RfidBufferService from '../services/_rfidBufferService';
import CameraBufferService from '../services/_cameraBufferService';
import { gateStaffAuth } from '../middleware';
import { internalError, badRequest } from '../utils';

const bufferRouter = express.Router();

// GET /buffer/status - Get buffer status
bufferRouter.get('/status', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const rfidBufferService = RfidBufferService.getInstance();
    const cameraBufferService = CameraBufferService.getInstance();
    
    const rfidStatus = rfidBufferService.getBufferStatus();
    const cameraStatus = cameraBufferService.getBufferStatus();
    
    const combinedStatus = {
      rfidBufferSize: rfidStatus.rfidBufferSize,
      cameraBufferSize: cameraStatus.cameraBufferSize,
      mergedEventsCount: 0, // Will be implemented when we add merging logic
      lastCleanup: rfidStatus.lastCleanup > cameraStatus.lastCleanup ? rfidStatus.lastCleanup : cameraStatus.lastCleanup,
      config: rfidStatus.config // Both services use same config
    };
    
    res.json({
      success: true,
      data: combinedStatus
    });
  } catch (error) {
    console.error('Error fetching buffer status:', error);
    internalError(res, 'Failed to fetch buffer status');
  }
});

// GET /buffer/rfid/events - Get all unprocessed RFID events
bufferRouter.get('/rfid/events', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const rfidBufferService = RfidBufferService.getInstance();
    const events = rfidBufferService.getAllUnprocessedRfidEvents();
    
    res.json({
      success: true,
      data: {
        events,
        count: events.length
      }
    });
  } catch (error) {
    console.error('Error fetching RFID events:', error);
    internalError(res, 'Failed to fetch RFID events');
  }
});

// GET /buffer/rfid/events/:gateId - Get RFID events by gate ID
bufferRouter.get('/rfid/events/:gateId', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { gateId } = req.params;
    
    if (!gateId) {
      badRequest(res, 'Gate ID is required');
      return;
    }

    const rfidBufferService = RfidBufferService.getInstance();
    const events = rfidBufferService.getRfidEventsByGate(gateId);
    
    res.json({
      success: true,
      data: {
        gateId,
        events,
        count: events.length
      }
    });
  } catch (error) {
    console.error('Error fetching RFID events by gate:', error);
    internalError(res, 'Failed to fetch RFID events by gate');
  }
});

// POST /buffer/rfid/events - Add test RFID event (for testing)
bufferRouter.post('/rfid/events', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { rfid_etc, gateId, license_plate } = req.body;
    
    // Validate required fields
    if (!rfid_etc || !gateId) {
      badRequest(res, 'Missing required fields: rfid_etc and gateId');
      return;
    }

    const rfidBufferService = RfidBufferService.getInstance();
    const eventId = rfidBufferService.addRfidEvent({
      timestamp: new Date(),
      rfid_etc,
      gateId,
      license_plate
    });
    
    res.json({
      success: true,
      message: 'RFID event added successfully',
      data: {
        eventId,
        rfid_etc,
        gateId,
        license_plate
      }
    });
  } catch (error) {
    console.error('Error adding RFID event:', error);
    internalError(res, 'Failed to add RFID event');
  }
});

// PUT /buffer/rfid/events/:eventId/process - Mark RFID event as processed
bufferRouter.put('/rfid/events/:eventId/process', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    
    if (!eventId) {
      badRequest(res, 'Event ID is required');
      return;
    }

    const rfidBufferService = RfidBufferService.getInstance();
    const success = rfidBufferService.markRfidEventAsProcessed(eventId);
    
    if (success) {
      res.json({
        success: true,
        message: 'RFID event marked as processed'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'RFID event not found'
      });
    }
  } catch (error) {
    console.error('Error processing RFID event:', error);
    internalError(res, 'Failed to process RFID event');
  }
});

// POST /buffer/config - Update buffer configuration
bufferRouter.post('/config', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { deltaTimeThreshold, maxBufferSize, cleanupInterval } = req.body;
    
    // Validate configuration values
    if (deltaTimeThreshold !== undefined && (typeof deltaTimeThreshold !== 'number' || deltaTimeThreshold <= 0)) {
      badRequest(res, 'deltaTimeThreshold must be a positive number');
      return;
    }
    
    if (maxBufferSize !== undefined && (typeof maxBufferSize !== 'number' || maxBufferSize <= 0)) {
      badRequest(res, 'maxBufferSize must be a positive number');
      return;
    }
    
    if (cleanupInterval !== undefined && (typeof cleanupInterval !== 'number' || cleanupInterval <= 0)) {
      badRequest(res, 'cleanupInterval must be a positive number');
      return;
    }

    const rfidBufferService = RfidBufferService.getInstance();
    rfidBufferService.updateConfig({
      deltaTimeThreshold,
      maxBufferSize,
      cleanupInterval
    });
    
    res.json({
      success: true,
      message: 'Buffer configuration updated successfully'
    });
  } catch (error) {
    console.error('Error updating buffer configuration:', error);
    internalError(res, 'Failed to update buffer configuration');
  }
});

// DELETE /buffer/clear - Clear all events (for testing)
bufferRouter.delete('/clear', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const rfidBufferService = RfidBufferService.getInstance();
    const cameraBufferService = CameraBufferService.getInstance();
    
    rfidBufferService.clearAllEvents();
    cameraBufferService.clearAllEvents();
    
    res.json({
      success: true,
      message: 'All buffer events cleared'
    });
  } catch (error) {
    console.error('Error clearing buffer:', error);
    internalError(res, 'Failed to clear buffer');
  }
});

// ===== CAMERA BUFFER ENDPOINTS =====

// GET /buffer/camera/events - Get all unprocessed Camera events
bufferRouter.get('/camera/events', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const cameraBufferService = CameraBufferService.getInstance();
    const events = cameraBufferService.getAllUnprocessedCameraEvents();
    
    res.json({
      success: true,
      data: {
        events,
        count: events.length
      }
    });
  } catch (error) {
    console.error('Error fetching Camera events:', error);
    internalError(res, 'Failed to fetch Camera events');
  }
});

// GET /buffer/camera/events/:gateId - Get Camera events by gate ID
bufferRouter.get('/camera/events/:gateId', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { gateId } = req.params;
    
    if (!gateId) {
      badRequest(res, 'Gate ID is required');
      return;
    }

    const cameraBufferService = CameraBufferService.getInstance();
    const events = cameraBufferService.getCameraEventsByGate(gateId);
    
    res.json({
      success: true,
      data: {
        gateId,
        events,
        count: events.length
      }
    });
  } catch (error) {
    console.error('Error fetching Camera events by gate:', error);
    internalError(res, 'Failed to fetch Camera events by gate');
  }
});

// GET /buffer/camera/events/license/:licensePlate - Get Camera events by license plate
bufferRouter.get('/camera/events/license/:licensePlate', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { licensePlate } = req.params;
    
    if (!licensePlate) {
      badRequest(res, 'License plate is required');
      return;
    }

    const cameraBufferService = CameraBufferService.getInstance();
    const events = cameraBufferService.getCameraEventsByLicensePlate(licensePlate);
    
    res.json({
      success: true,
      data: {
        licensePlate,
        events,
        count: events.length
      }
    });
  } catch (error) {
    console.error('Error fetching Camera events by license plate:', error);
    internalError(res, 'Failed to fetch Camera events by license plate');
  }
});

// POST /buffer/camera/events - Add test Camera event (for testing)
bufferRouter.post('/camera/events', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { license_plate, gateId, imageData } = req.body;
    
    // Validate required fields
    if (!license_plate || !gateId) {
      badRequest(res, 'Missing required fields: license_plate and gateId');
      return;
    }

    const cameraBufferService = CameraBufferService.getInstance();

    // Normalize imageData to array of base64 strings (max 3)
    const base64String: string | undefined = Array.isArray(imageData)
      ? (imageData[0] || undefined)
      : (typeof imageData === 'string' && imageData ? imageData : undefined);

    let imageUrl: string | undefined = undefined;

    if (base64String) {
      // Convert base64 string to buffer and upload to Cloudinary
      const { uploadBufferToCloudinary } = await import('../utils');
      const commaIdx = base64String.indexOf(',');
      const pureBase64 = commaIdx !== -1 ? base64String.substring(commaIdx + 1) : base64String;
      const buffer = Buffer.from(pureBase64, 'base64');
      imageUrl = await uploadBufferToCloudinary(buffer, { folder: 'qlbx/events', resource_type: 'image' });
    }

    const eventId = cameraBufferService.addCameraEvent({
      timestamp: new Date(),
      license_plate,
      gateId,
      imageData: undefined,
      imageUrl
    });
    
    res.json({
      success: true,
      message: 'Camera event added successfully',
      data: {
        eventId,
        license_plate,
        gateId,
        imageUrl: imageUrl || 'not provided'
      }
    });
  } catch (error) {
    console.error('Error adding Camera event:', error);
    internalError(res, 'Failed to add Camera event');
  }
});

// PUT /buffer/camera/events/:eventId/process - Mark Camera event as processed
bufferRouter.put('/camera/events/:eventId/process', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    
    if (!eventId) {
      badRequest(res, 'Event ID is required');
      return;
    }

    const cameraBufferService = CameraBufferService.getInstance();
    const success = cameraBufferService.markCameraEventAsProcessed(eventId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Camera event marked as processed'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Camera event not found'
      });
    }
  } catch (error) {
    console.error('Error processing Camera event:', error);
    internalError(res, 'Failed to process Camera event');
  }
});

export default bufferRouter;
