/**
 * Event Management API Routes
 * For managing merged events and event history
 */

import express from 'express';
import { Event, EventType, EventStatus } from '../models';
import { gateStaffAuth } from '../middleware';
import { internalError, badRequest, success, notFound, created } from '../utils';

const eventRouter = express.Router();

// Interface for Event request
interface IEventRequest extends express.Request {
  body: {
    eventType: EventType;
    license_plate: string;
    gateId: string;
    rfidEvent?: {
      rfid_etc: string;
      timestamp: Date;
      gateId: string;
    };
    cameraEvent?: {
      license_plate: string;
      timestamp: Date;
      gateId: string;
      imageUrl?: string;
    };
  };
}

// GET /event - Get all events with pagination and filters
eventRouter.get('/', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Parse query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const eventType = req.query.eventType as string;
    const status = req.query.status as string;
    const gateId = req.query.gateId as string;
    const licensePlate = req.query.licensePlate as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Validate pagination parameters
    if (page < 1) {
      badRequest(res, 'Số trang phải lớn hơn 0');
      return;
    }

    if (limit < 1 || limit > 100) {
      badRequest(res, 'Giới hạn phải từ 1 đến 100');
      return;
    }

    // Calculate skip value
    const skip = (page - 1) * limit;

    // Build filter object
    const filter: any = {};
    
    if (eventType && Object.values(EventType).includes(eventType as EventType)) {
      filter.eventType = eventType;
    }
    
    if (status && Object.values(EventStatus).includes(status as EventStatus)) {
      filter.status = status;
    }
    
    if (gateId) {
      filter.gateId = gateId;
    }
    
    if (licensePlate) {
      filter.license_plate = licensePlate.toUpperCase();
    }
    
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.timestamp.$lte = new Date(endDate);
      }
    }

    // Get total count for pagination info
    const totalEvents = await Event.countDocuments(filter);
    const totalPages = Math.ceil(totalEvents / limit);

    // Get events with pagination
    const events = await Event.find(filter)
      .populate('vehicle_id', 'license_plate vehicle_type company rfid_etc gate')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    success(res, {
      events,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalEvents,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    }, 'Lấy danh sách sự kiện thành công');
  } catch (error: any) {
    console.error('Error fetching events:', error);
    internalError(res, 'Không thể lấy danh sách sự kiện');
  }
});

// GET /event/:id - Get event by ID
eventRouter.get('/:id', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      badRequest(res, 'ID sự kiện là bắt buộc');
      return;
    }

    const event = await Event.findById(id)
      .populate('vehicle_id', 'license_plate vehicle_type company rfid_etc gate');

    if (!event) {
      notFound(res, 'Không tìm thấy sự kiện');
      return;
    }

    success(res, event, 'Lấy thông tin sự kiện thành công');
  } catch (error: any) {
    console.error('Error fetching event:', error);
    internalError(res, 'Không thể lấy thông tin sự kiện');
  }
});

// POST /event - Create a new event
eventRouter.post('/', gateStaffAuth, async (req: IEventRequest, res: express.Response): Promise<void> => {
  try {
    const { eventType, license_plate, gateId, rfidEvent, cameraEvent } = req.body;

    // Validate required fields
    if (!eventType || !license_plate || !gateId) {
      badRequest(res, 'Thiếu các trường bắt buộc: eventType, license_plate và gateId là bắt buộc');
      return;
    }

    // Validate eventType enum
    if (!Object.values(EventType).includes(eventType)) {
      badRequest(res, `Loại sự kiện không hợp lệ. Phải là một trong: ${Object.values(EventType).join(', ')}`);
      return;
    }

    // Validate that at least one event data is provided
    if (!rfidEvent && !cameraEvent) {
      badRequest(res, 'Phải cung cấp ít nhất một trong rfidEvent hoặc cameraEvent');
      return;
    }


    // Resolve timestamp from provided event data (prefer earliest of provided timestamps)
    let resolvedTimestamp: Date = new Date();
    if (rfidEvent?.timestamp && cameraEvent?.timestamp) {
      resolvedTimestamp = new Date(Math.min(new Date(rfidEvent.timestamp).getTime(), new Date(cameraEvent.timestamp).getTime()));
    } else if (rfidEvent?.timestamp) {
      resolvedTimestamp = new Date(rfidEvent.timestamp);
    } else if (cameraEvent?.timestamp) {
      resolvedTimestamp = new Date(cameraEvent.timestamp);
    }

    // Create event data object
    const eventData: any = {
      eventType,
      license_plate: license_plate.toUpperCase(),
      gateId,
      timestamp: resolvedTimestamp
    };

    // Add optional fields
    if (rfidEvent) eventData.rfidEvent = rfidEvent;
    if (cameraEvent) eventData.cameraEvent = cameraEvent;

    // Create the event
    const event = await Event.create(eventData);

    // Populate vehicle info
    await event.populate('vehicle_id', 'license_plate vehicle_type company rfid_etc gate');

    created(res, event, 'Tạo sự kiện thành công');
  } catch (error: any) {
    console.error('Error creating event:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      badRequest(res, 'Lỗi xác thực dữ liệu');
      return;
    }

    internalError(res, 'Không thể tạo sự kiện');
  }
});

// PUT /event/:id/status - Update event status
eventRouter.put('/:id/status', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, failureReason, imageUrl, cameraEvent } = req.body as any;

    if (!id) {
      badRequest(res, 'ID sự kiện là bắt buộc');
      return;
    }

    if (!status && !imageUrl && !(cameraEvent && cameraEvent.imageUrl)) {
      badRequest(res, 'Phải cung cấp status hoặc imageUrl');
      return;
    }

    // Validate status enum
    if (status && !Object.values(EventStatus).includes(status)) {
      badRequest(res, `Trạng thái không hợp lệ. Phải là một trong: ${Object.values(EventStatus).join(', ')}`);
      return;
    }

    // Find the event
    const event = await Event.findById(id);
    if (!event) {
      notFound(res, 'Không tìm thấy sự kiện');
      return;
    }

    // Prepare update data
    const updateData: any = {
      status,
      updatedAt: new Date()
    };

    if ((status === EventStatus.ETC_ERROR || status === EventStatus.REJECTED) && failureReason) {
      updateData.failureReason = failureReason;
    }

    // Optionally update cameraEvent.imageUrl later
    const newImageUrl: string | undefined = cameraEvent?.imageUrl ?? imageUrl;
    if (newImageUrl && typeof newImageUrl === 'string') {
      updateData['cameraEvent.imageUrl'] = newImageUrl;
    }

    // Update the event
    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('vehicle_id', 'license_plate vehicle_type company rfid_etc gate');

    success(res, updatedEvent, 'Cập nhật trạng thái sự kiện thành công');
  } catch (error: any) {
    console.error('Error updating event status:', error);
    internalError(res, 'Không thể cập nhật trạng thái sự kiện');
  }
});

// GET /event/stats/summary - Get event statistics
eventRouter.get('/stats/summary', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Build date filter
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.timestamp = {};
      if (startDate) dateFilter.timestamp.$gte = new Date(startDate);
      if (endDate) dateFilter.timestamp.$lte = new Date(endDate);
    }

    // Get statistics
    const [
      totalEvents,
      mergedEvents,
      rfidOnlyEvents,
      cameraOnlyEvents,
      acceptedEvents,
      rejectedEvents,
      etcErrorEvents,
      noEtcEvents
    ] = await Promise.all([
      Event.countDocuments(dateFilter),
      Event.countDocuments({ ...dateFilter, eventType: EventType.MERGED }),
      Event.countDocuments({ ...dateFilter, eventType: EventType.RFID_ONLY }),
      Event.countDocuments({ ...dateFilter, eventType: EventType.CAMERA_ONLY }),
      Event.countDocuments({ ...dateFilter, status: EventStatus.ACCEPTED }),
      Event.countDocuments({ ...dateFilter, status: EventStatus.REJECTED }),
      Event.countDocuments({ ...dateFilter, status: EventStatus.ETC_ERROR }),
      Event.countDocuments({ ...dateFilter, status: EventStatus.NO_ETC })
    ]);

    const stats = {
      totalEvents,
      eventTypes: {
        merged: mergedEvents,
        rfidOnly: rfidOnlyEvents,
        cameraOnly: cameraOnlyEvents
      },
      status: {
        accepted: acceptedEvents,
        rejected: rejectedEvents,
        etcError: etcErrorEvents,
        noEtc: noEtcEvents
      },
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null
      }
    };

    success(res, stats, 'Lấy thống kê sự kiện thành công');
  } catch (error: any) {
    console.error('Error fetching event statistics:', error);
    internalError(res, 'Không thể lấy thống kê sự kiện');
  }
});

export default eventRouter;
