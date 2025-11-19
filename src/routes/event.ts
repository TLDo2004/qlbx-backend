/**
 * Event Management API Routes
 * For managing merged events and event history
 */

import express from 'express';
import {
  Event,
  EventType,
  EventStatus,
  Fee,
  FeeRecord,
  RfidEtc,
  Transaction,
  TransactionSource,
  TransactionType,
  Vehicle
} from '../models';
import { FeeType } from '../models/feeModel';
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

    const normalizedPlate = license_plate.trim().toUpperCase();
    const isGateIn = gateId.toLowerCase() === 'gate_in';
    const isGateOut = gateId.toLowerCase() === 'gate_out';

    let linkedVehicle = await Vehicle.findOne({ license_plate: normalizedPlate });
    let applicableFee = null;
    let linkedRfidEtc = null;

    if (!linkedVehicle) {
      linkedVehicle = await Vehicle.findOne({ rfid_etc: rfidEvent?.rfid_etc });
    }

    if (linkedVehicle && !linkedVehicle.license_plate) {
      linkedVehicle.license_plate = normalizedPlate;
    }

    if (isGateIn) {
      if (!linkedVehicle) {
        badRequest(res, 'Không tìm thấy phương tiện tương ứng với sự kiện gate_in');
        return;
      }

      const feeFilter: any = { fee_type: FeeType.PASSING };
      if (linkedVehicle.vehicle_type) {
        feeFilter.vehicle_type = linkedVehicle.vehicle_type;
      } else {
        feeFilter.vehicle_type = { $exists: false };
      }

      applicableFee = await Fee.findOne(feeFilter);

      if (!applicableFee) {
        badRequest(res, 'Chưa cấu hình biểu phí passing cho loại phương tiện này');
        return;
      }

      if (linkedVehicle.rfid_etc) {
        linkedRfidEtc = await RfidEtc.findOne({ rfid_etc: linkedVehicle.rfid_etc });

        if (linkedRfidEtc) {
          if (!linkedRfidEtc.is_active) {
            badRequest(res, 'RFID/ETC của phương tiện đang bị khóa');
            return;
          }

          if (linkedRfidEtc.balance < applicableFee.amount) {
            badRequest(res, 'Số dư RFID/ETC không đủ để trừ phí');
            return;
          }
        }
      }
    }

    if (isGateOut) {
      if (!linkedVehicle) {
        badRequest(res, 'Không tìm thấy phương tiện tương ứng với sự kiện gate_out');
        return;
      }

      // Tìm event gate_in mới nhất của vehicle này
      const latestGateInEvent = await Event.findOne({
        vehicle_id: linkedVehicle._id,
        gateId: 'gate_in'
      })
        .sort({ timestamp: -1 });

      if (!latestGateInEvent) {
        badRequest(res, 'Không tìm thấy sự kiện gate_in trước đó cho phương tiện này');
        return;
      }

      // Tính parking_time (giờ)
      const parkingTimeInMs = resolvedTimestamp.getTime() - latestGateInEvent.timestamp.getTime();
      const parkingTimeInHours = parkingTimeInMs / (1000 * 60 * 60);

      // Tìm fee parking
      const feeFilter: any = { fee_type: FeeType.PARKING };
      if (linkedVehicle.vehicle_type) {
        feeFilter.vehicle_type = linkedVehicle.vehicle_type;
      } else {
        feeFilter.vehicle_type = { $exists: false };
      }

      applicableFee = await Fee.findOne(feeFilter);

      if (!applicableFee) {
        badRequest(res, 'Chưa cấu hình biểu phí parking cho loại phương tiện này');
        return;
      }

      // Tính amount = fee.amount * parking_time (giờ)
      const calculatedAmount = applicableFee.amount * parkingTimeInHours;

      if (linkedVehicle.rfid_etc) {
        linkedRfidEtc = await RfidEtc.findOne({ rfid_etc: linkedVehicle.rfid_etc });

        if (linkedRfidEtc) {
          if (!linkedRfidEtc.is_active) {
            badRequest(res, 'RFID/ETC của phương tiện đang bị khóa');
            return;
          }

          if (linkedRfidEtc.balance < calculatedAmount) {
            badRequest(res, 'Số dư RFID/ETC không đủ để trừ phí parking');
            return;
          }
        }
      }
    }

    // Create event data object
    const eventData: any = {
      eventType,
      license_plate: normalizedPlate,
      gateId,
      timestamp: resolvedTimestamp
    };

    if (linkedVehicle) {
      eventData.vehicle_id = linkedVehicle._id;
    }

    // Add optional fields
    if (rfidEvent) eventData.rfidEvent = rfidEvent;
    if (cameraEvent) eventData.cameraEvent = cameraEvent;

    // Create the event
    const event = await Event.create(eventData);

    let createdFeeRecord = null;
    let createdTransaction = null;

    if (isGateIn && linkedVehicle && applicableFee) {
      const feeRecord = await FeeRecord.create({
        vehicle_id: linkedVehicle._id,
        event_id: event._id,
        fee_id: applicableFee._id,
        timestamp: resolvedTimestamp,
        amount: applicableFee.amount,
        is_paid: false
      });

      if (linkedRfidEtc) {
        const balance_before = linkedRfidEtc.balance;
        const balance_after = balance_before - applicableFee.amount;
        const note = `${new Date().toISOString()} passing ${applicableFee.fee_name}`;

        const transaction = await Transaction.create({
          rfid_etc_id: linkedRfidEtc._id,
          amount: applicableFee.amount,
          type: TransactionType.CASH_OUT,
          source: TransactionSource.CASH,
          balance_before,
          balance_after,
          note
        });

        linkedRfidEtc.balance = balance_after;
        await linkedRfidEtc.save();

        feeRecord.transaction_id = transaction._id as any;
        feeRecord.is_paid = true;
        feeRecord.paid_at = new Date();
        await feeRecord.save();

        createdTransaction = await transaction.populate('rfid_etc_id');
      }

      createdFeeRecord = await feeRecord.populate(['vehicle_id', 'event_id', 'fee_id', 'transaction_id']);
    }

    if (isGateOut && linkedVehicle && applicableFee) {
      // Tìm lại event gate_in mới nhất để tính parking_time
      const latestGateInEvent = await Event.findOne({
        vehicle_id: linkedVehicle._id,
        gateId: 'gate_in'
      })
        .sort({ timestamp: -1 });

      if (latestGateInEvent) {
        const parkingTimeInMs = resolvedTimestamp.getTime() - latestGateInEvent.timestamp.getTime();
        const parkingTimeInHours = parkingTimeInMs / (1000 * 60 * 60);
        const parkingTimeInMinutes = Math.round(parkingTimeInHours * 60);
        const calculatedAmount = applicableFee.amount * parkingTimeInHours;

        const feeRecord = await FeeRecord.create({
          vehicle_id: linkedVehicle._id,
          event_id: event._id,
          fee_id: applicableFee._id,
          timestamp: resolvedTimestamp,
          amount: calculatedAmount,
          parking_time: parkingTimeInMinutes,
          is_paid: false
        });

        if (linkedRfidEtc) {
          const balance_before = linkedRfidEtc.balance;
          const balance_after = balance_before - calculatedAmount;
          const note = `${new Date().toISOString()} parking ${applicableFee.fee_name} (${parkingTimeInHours.toFixed(2)} giờ)`;

          const transaction = await Transaction.create({
            rfid_etc_id: linkedRfidEtc._id,
            amount: calculatedAmount,
            type: TransactionType.CASH_OUT,
            source: TransactionSource.CASH,
            balance_before,
            balance_after,
            note
          });

          linkedRfidEtc.balance = balance_after;
          await linkedRfidEtc.save();

          feeRecord.transaction_id = transaction._id as any;
          feeRecord.is_paid = true;
          feeRecord.paid_at = new Date();
          await feeRecord.save();

          createdTransaction = await transaction.populate('rfid_etc_id');
        }

        createdFeeRecord = await feeRecord.populate(['vehicle_id', 'event_id', 'fee_id', 'transaction_id']);
      }
    }

    // Populate vehicle info
    await event.populate('vehicle_id', 'license_plate vehicle_type company rfid_etc gate');

    created(res, {
      event,
      fee_record: createdFeeRecord,
      transaction: createdTransaction
    }, 'Tạo sự kiện thành công');
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
