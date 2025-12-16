/**
 * Event Management API Routes
 * For managing merged events and event history
 */

import express from 'express';
import { Event, EventType, EventStatus, GateId, Direction, ParkingSession, FeeRecord } from '../../models';
import { gateStaffAuth } from '../../middleware';
import { internalError, badRequest, success, notFound } from '../../utils';

const eventRouter = express.Router();

// GET /event - Get all events with pagination and filters
eventRouter.get('/', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Parse query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const eventType = req.query.eventType as string;
    const status = req.query.status as string;
    const gateId = req.query.gateId as string;
    const direction = req.query.direction as string;
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
      if (Object.values(GateId).includes(gateId as GateId)) {
        filter.gateId = gateId;
      } else {
        badRequest(res, 'gateId không hợp lệ. Phải là "gate_in" hoặc "gate_out"');
        return;
      }
    }
    
    if (direction) {
      if (Object.values(Direction).includes(direction as Direction)) {
        filter.direction = direction;
      } else {
        badRequest(res, 'direction không hợp lệ. Phải là "in" hoặc "out"');
        return;
      }
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
      .populate({
        path: 'vehicle_id',
        populate: [
          {
            path: 'companyId',
            select: 'name tax_code address phone contract_start contract_end is_active'
          },
          {
            path: 'routeId',
            select: 'name origin destination'
          }
        ]
      })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    // Populate fee records for each event through parking_session
    // Fee records are only created for exit events (gate_out), so only check exit events
    const eventsWithFeeRecords = await Promise.all(
      events.map(async (event) => {
        const eventObj: any = event.toObject();
        
        // Only find fee record for exit events (direction === 'out')
        // Fee is calculated and recorded when vehicle exits
        if (event.direction === 'out') {
          // Find parking session with exit_event_id matching this event
          const parkingSession = await ParkingSession.findOne({ exit_event_id: event._id });

          // If parking session found, find fee record linked to that session
          if (parkingSession) {
            const feeRecord = await FeeRecord.findOne({ parking_session_id: parkingSession._id })
              .populate({
                path: 'fee_rule_id',
                select: 'name min_seat max_seat amount is_active'
              });
            
            if (feeRecord) {
              eventObj.feeRecord_id = feeRecord.toObject();
            }
          }
        }
        // For entry events (direction === 'in'), no fee record exists yet

        return eventObj;
      })
    );

    success(res, {
      events: eventsWithFeeRecords,
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
      .populate({
        path: 'vehicle_id',
        populate: [
          {
            path: 'companyId',
            select: 'name tax_code address phone contract_start contract_end is_active'
          },
          {
            path: 'routeId',
            select: 'name origin destination'
          }
        ]
      });

    if (!event) {
      notFound(res, 'Không tìm thấy sự kiện');
      return;
    }

    // Populate fee record for this event through parking_session
    // Fee records are only created for exit events (gate_out)
    const eventObj: any = event.toObject();
    
    // Only find fee record for exit events (direction === 'out')
    if (event.direction === 'out') {
      // Find parking session with exit_event_id matching this event
      const parkingSession = await ParkingSession.findOne({ exit_event_id: event._id });

      // If parking session found, find fee record linked to that session
      if (parkingSession) {
        const feeRecord = await FeeRecord.findOne({ parking_session_id: parkingSession._id })
          .populate({
            path: 'fee_rule_id',
            select: 'name min_seat max_seat amount is_active'
          });
        
        if (feeRecord) {
          eventObj.feeRecord_id = feeRecord.toObject();
        }
      }
    }
    // For entry events (direction === 'in'), no fee record exists yet

    success(res, eventObj, 'Lấy thông tin sự kiện thành công');
  } catch (error: any) {
    console.error('Error fetching event:', error);
    internalError(res, 'Không thể lấy thông tin sự kiện');
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
    ).populate({
      path: 'vehicle_id',
      populate: [
        {
          path: 'companyId',
          select: 'name tax_code address phone contract_start contract_end is_active'
        },
        {
          path: 'routeId',
          select: 'name origin destination'
        }
      ]
    });

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

