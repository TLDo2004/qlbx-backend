import express from 'express';
import mongoose from 'mongoose';
import { FeeRecord, FeeRecordStatus, ParkingSession } from '../../models';
import { internalError } from '../../utils';

const feeRecordRouter = express.Router();

const isValidObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

// GET /fee-record - list fee records with optional filters
feeRecordRouter.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const vehicleId = req.query.vehicle_id as string;
    const status = req.query.status as string;
    const parkingSessionId = req.query.parking_session_id as string;

    if (page < 1 || limit < 1 || limit > 100) {
      res.status(400).json({
        success: false,
        error: 'Tham số phân trang không hợp lệ',
      });
      return;
    }

    const filter: any = {};

    if (vehicleId) {
      if (!isValidObjectId(vehicleId)) {
        res.status(400).json({ success: false, error: 'vehicle_id không hợp lệ' });
        return;
      }
      filter.vehicle_id = new mongoose.Types.ObjectId(vehicleId);
    }

    if (parkingSessionId) {
      if (!isValidObjectId(parkingSessionId)) {
        res.status(400).json({ success: false, error: 'parking_session_id không hợp lệ' });
        return;
      }
      filter.parking_session_id = new mongoose.Types.ObjectId(parkingSessionId);
    }

    if (status) {
      if (!Object.values(FeeRecordStatus).includes(status as FeeRecordStatus)) {
        res.status(400).json({
          success: false,
          error: `Trạng thái không hợp lệ. Phải là một trong: ${Object.values(FeeRecordStatus).join(', ')}`,
        });
        return;
      }
      filter.status = status;
    }

    const skip = (page - 1) * limit;

    const total = await FeeRecord.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    const records = await FeeRecord.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      data: records,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching fee records:', error);
    internalError(res, 'Không thể lấy danh sách fee record');
  }
});

// GET /fee-record/:id - get fee record by id
feeRecordRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: 'ID không hợp lệ' });
      return;
    }

    const record = await FeeRecord.findById(id);

    if (!record) {
      res.status(404).json({ success: false, error: 'Không tìm thấy fee record' });
      return;
    }

    res.json({ success: true, data: record });
  } catch (error) {
    console.error('Error fetching fee record:', error);
    internalError(res, 'Không thể lấy fee record');
  }
});

// POST /fee-record - create fee record
feeRecordRouter.post('/', async (req, res) => {
  try {
    const { parking_session_id, vehicle_id, fee_rule_id, amount, status, paid_at } = req.body;

    if (!vehicle_id || !fee_rule_id || amount === undefined) {
      res.status(400).json({
        success: false,
        error: 'Thiếu trường bắt buộc: vehicle_id, fee_rule_id, amount',
      });
      return;
    }

    if (!isValidObjectId(vehicle_id) || !isValidObjectId(fee_rule_id)) {
      res.status(400).json({ success: false, error: 'vehicle_id hoặc fee_rule_id không hợp lệ' });
      return;
    }

    if (parking_session_id && !isValidObjectId(parking_session_id)) {
      res.status(400).json({ success: false, error: 'parking_session_id không hợp lệ' });
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ success: false, error: 'amount phải là số >= 0' });
      return;
    }

    if (status && !Object.values(FeeRecordStatus).includes(status as FeeRecordStatus)) {
      res.status(400).json({
        success: false,
        error: `Trạng thái không hợp lệ. Phải là một trong: ${Object.values(FeeRecordStatus).join(', ')}`,
      });
      return;
    }

    if (parking_session_id) {
      const session = await ParkingSession.findById(parking_session_id);
      if (!session) {
        res.status(400).json({ success: false, error: 'parking_session không tồn tại' });
        return;
      }
    }

    const payload: any = {
      vehicle_id: new mongoose.Types.ObjectId(vehicle_id),
      fee_rule_id: new mongoose.Types.ObjectId(fee_rule_id),
      amount: parsedAmount,
      status:
        status && Object.values(FeeRecordStatus).includes(status as FeeRecordStatus)
          ? status
          : FeeRecordStatus.PENDING,
    };

    if (parking_session_id) {
      payload.parking_session_id = new mongoose.Types.ObjectId(parking_session_id);
    }

    if (paid_at) {
      const paidAtDate = new Date(paid_at);
      if (isNaN(paidAtDate.getTime())) {
        res.status(400).json({ success: false, error: 'Định dạng paid_at không hợp lệ' });
        return;
      }
      payload.paid_at = paidAtDate;
    }

    const record = await FeeRecord.create(payload);

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    console.error('Error creating fee record:', error);
    internalError(res, 'Không thể tạo fee record');
  }
});

// PUT /fee-record/:id/status - update fee record status (and optional paid_at)
feeRecordRouter.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paid_at } = req.body;

    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: 'ID không hợp lệ' });
      return;
    }

    if (!status || !Object.values(FeeRecordStatus).includes(status as FeeRecordStatus)) {
      res.status(400).json({
        success: false,
        error: `Trạng thái không hợp lệ. Phải là một trong: ${Object.values(FeeRecordStatus).join(', ')}`,
      });
      return;
    }

    const update: any = { status };

    if (paid_at !== undefined) {
      if (paid_at === null) {
        update.paid_at = undefined;
      } else {
        const paidAtDate = new Date(paid_at);
        if (isNaN(paidAtDate.getTime())) {
          res.status(400).json({ success: false, error: 'Định dạng paid_at không hợp lệ' });
          return;
        }
        update.paid_at = paidAtDate;
      }
    }

    const record = await FeeRecord.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });

    if (!record) {
      res.status(404).json({ success: false, error: 'Không tìm thấy fee record' });
      return;
    }

    res.json({ success: true, data: record });
  } catch (error) {
    console.error('Error updating fee record status:', error);
    internalError(res, 'Không thể cập nhật fee record');
  }
});

export default feeRecordRouter;


