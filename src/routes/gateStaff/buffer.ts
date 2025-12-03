/**
 * Buffer Management API Routes
 * For testing and monitoring RFID/Camera buffer system
 */

import express from 'express';
import RfidBufferService from '../../services/_rfidBufferService';
import CameraBufferService from '../../services/_cameraBufferService';
import { GateId } from '../../models';
import { gateStaffAuth } from '../../middleware';
import { internalError, badRequest } from '../../utils';

const bufferRouter = express.Router();

// GET /gate-staff/buffer/status - Get buffer status
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
    internalError(res, 'Không thể lấy trạng thái buffer');
  }
});

// GET /gate-staff/buffer/rfid/events - Get all unprocessed RFID events
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
    internalError(res, 'Không thể lấy danh sách sự kiện RFID');
  }
});

// GET /gate-staff/buffer/rfid/events/:gateId - Get RFID events by gate ID
bufferRouter.get('/rfid/events/:gateId', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { gateId } = req.params;
    
    if (!gateId || !Object.values(GateId).includes(gateId as GateId)) {
      badRequest(res, 'ID cổng không hợp lệ. Phải là "gate_in" hoặc "gate_out"');
      return;
    }

    const rfidBufferService = RfidBufferService.getInstance();
    const events = rfidBufferService.getRfidEventsByGate(gateId as GateId);
    
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
    internalError(res, 'Không thể lấy danh sách sự kiện RFID theo cổng');
  }
});

// POST /gate-staff/buffer/rfid/events - Add test RFID event (for testing)
bufferRouter.post('/rfid/events', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { rfid_etc, gateId, license_plate } = req.body;
    
    // Validate required fields
    if (!rfid_etc || !gateId) {
      badRequest(res, 'Thiếu các trường bắt buộc: rfid_etc và gateId');
      return;
    }

    if (!Object.values(GateId).includes(gateId as GateId)) {
      badRequest(res, 'gateId không hợp lệ. Phải là "gate_in" hoặc "gate_out"');
      return;
    }

    const rfidBufferService = RfidBufferService.getInstance();
    const eventId = rfidBufferService.addRfidEvent({
      timestamp: new Date(),
      rfid_etc,
      gateId: gateId as GateId,
      license_plate
    });
    
    res.json({
      success: true,
      message: 'Thêm sự kiện RFID thành công',
      data: {
        eventId,
        rfid_etc,
        gateId,
        license_plate
      }
    });
  } catch (error) {
    console.error('Error adding RFID event:', error);
    internalError(res, 'Không thể thêm sự kiện RFID');
  }
});

// PUT /gate-staff/buffer/rfid/events/:eventId/process - Mark RFID event as processed
bufferRouter.put('/rfid/events/:eventId/process', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    
    if (!eventId) {
      badRequest(res, 'ID sự kiện là bắt buộc');
      return;
    }

    const rfidBufferService = RfidBufferService.getInstance();
    const success = rfidBufferService.markRfidEventAsProcessed(eventId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Đánh dấu sự kiện RFID đã xử lý'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Không tìm thấy sự kiện RFID'
      });
    }
  } catch (error) {
    console.error('Error processing RFID event:', error);
    internalError(res, 'Không thể xử lý sự kiện RFID');
  }
});

// POST /gate-staff/buffer/config - Update buffer configuration
bufferRouter.post('/config', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { deltaTimeThreshold, maxBufferSize, cleanupInterval } = req.body;
    
    // Validate configuration values
    if (deltaTimeThreshold !== undefined && (typeof deltaTimeThreshold !== 'number' || deltaTimeThreshold <= 0)) {
      badRequest(res, 'deltaTimeThreshold phải là số dương');
      return;
    }
    
    if (maxBufferSize !== undefined && (typeof maxBufferSize !== 'number' || maxBufferSize <= 0)) {
      badRequest(res, 'maxBufferSize phải là số dương');
      return;
    }
    
    if (cleanupInterval !== undefined && (typeof cleanupInterval !== 'number' || cleanupInterval <= 0)) {
      badRequest(res, 'cleanupInterval phải là số dương');
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
      message: 'Cập nhật cấu hình buffer thành công'
    });
  } catch (error) {
    console.error('Error updating buffer configuration:', error);
    internalError(res, 'Không thể cập nhật cấu hình buffer');
  }
});

// DELETE /gate-staff/buffer/clear - Clear all events (for testing)
bufferRouter.delete('/clear', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const rfidBufferService = RfidBufferService.getInstance();
    const cameraBufferService = CameraBufferService.getInstance();
    
    rfidBufferService.clearAllEvents();
    cameraBufferService.clearAllEvents();
    
    res.json({
      success: true,
      message: 'Đã xóa tất cả sự kiện buffer'
    });
  } catch (error) {
    console.error('Error clearing buffer:', error);
    internalError(res, 'Không thể xóa buffer');
  }
});

// ===== CAMERA BUFFER ENDPOINTS =====

// GET /gate-staff/buffer/camera/events - Get all unprocessed Camera events
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
    internalError(res, 'Không thể lấy danh sách sự kiện Camera');
  }
});

// GET /gate-staff/buffer/camera/events/:gateId - Get Camera events by gate ID
bufferRouter.get('/camera/events/:gateId', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { gateId } = req.params;
    
    if (!gateId || !Object.values(GateId).includes(gateId as GateId)) {
      badRequest(res, 'ID cổng không hợp lệ. Phải là "gate_in" hoặc "gate_out"');
      return;
    }

    const cameraBufferService = CameraBufferService.getInstance();
    const events = cameraBufferService.getCameraEventsByGate(gateId as GateId);
    
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
    internalError(res, 'Không thể lấy danh sách sự kiện Camera theo cổng');
  }
});

// GET /gate-staff/buffer/camera/events/license/:licensePlate - Get Camera events by license plate
bufferRouter.get('/camera/events/license/:licensePlate', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { licensePlate } = req.params;
    
    if (!licensePlate) {
      badRequest(res, 'Biển số xe là bắt buộc');
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
    internalError(res, 'Không thể lấy danh sách sự kiện Camera theo biển số');
  }
});

// POST /gate-staff/buffer/camera/events - Add test Camera event (for testing)
bufferRouter.post('/camera/events', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { license_plate, gateId, imageData } = req.body;
    
    // Validate required fields
    if (!license_plate || !gateId) {
      badRequest(res, 'Thiếu các trường bắt buộc: license_plate và gateId');
      return;
    }

    if (!Object.values(GateId).includes(gateId as GateId)) {
      badRequest(res, 'gateId không hợp lệ. Phải là "gate_in" hoặc "gate_out"');
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
      const { uploadBufferToCloudinary } = await import('../../utils');
      const commaIdx = base64String.indexOf(',');
      const pureBase64 = commaIdx !== -1 ? base64String.substring(commaIdx + 1) : base64String;
      const buffer = Buffer.from(pureBase64, 'base64');
      imageUrl = await uploadBufferToCloudinary(buffer, { folder: 'qlbx/events', resource_type: 'image' });
    }

    const eventId = cameraBufferService.addCameraEvent({
      timestamp: new Date(),
      license_plate,
      gateId: gateId as GateId,
      imageData: undefined,
      imageUrl
    });
    
    res.json({
      success: true,
      message: 'Thêm sự kiện Camera thành công',
      data: {
        eventId,
        license_plate,
        gateId,
        imageUrl: imageUrl || 'not provided'
      }
    });
  } catch (error) {
    console.error('Error adding Camera event:', error);
    internalError(res, 'Không thể thêm sự kiện Camera');
  }
});

// PUT /gate-staff/buffer/camera/events/:eventId/process - Mark Camera event as processed
bufferRouter.put('/camera/events/:eventId/process', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    
    if (!eventId) {
      badRequest(res, 'ID sự kiện là bắt buộc');
      return;
    }

    const cameraBufferService = CameraBufferService.getInstance();
    const success = cameraBufferService.markCameraEventAsProcessed(eventId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Đánh dấu sự kiện Camera đã xử lý'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Không tìm thấy sự kiện Camera'
      });
    }
  } catch (error) {
    console.error('Error processing Camera event:', error);
    internalError(res, 'Không thể xử lý sự kiện Camera');
  }
});

export default bufferRouter;


