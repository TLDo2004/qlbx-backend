import express from 'express';
import mongoose from 'mongoose';
import { FeeRecord } from '../models';
import { internalError } from '../utils';

const feeRecordRouter = express.Router();

// helper validate objectid
const isValidObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

// GET /fee-record - list all fee records
feeRecordRouter.get('/', async (_req, res) => {
    try {
        const feeRecords = await FeeRecord.find()
            .populate('vehicle_id')
            .populate('event_id')
            .populate('fee_id')
            .sort({ timestamp: -1 });

        res.json({
            success: true,
            data: feeRecords
        });
    } catch (error) {
        console.error('Error fetching fee records:', error);
        internalError(res, 'Không thể lấy danh sách giao dịch phí');
    }
});

// GET /fee-record/:id - get fee record by id
feeRecordRouter.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const feeRecord = await FeeRecord.findById(id)
            .populate('vehicle_id')
            .populate('event_id')
            .populate('fee_id');

        if (!feeRecord) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy giao dịch phí'
            });
            return;
        }

        res.json({
            success: true,
            data: feeRecord
        });
    } catch (error) {
        console.error('Error fetching fee record:', error);
        internalError(res, 'Không thể lấy thông tin giao dịch phí');
    }
});

// POST /fee-record - create fee record
feeRecordRouter.post('/', async (req, res) => {
    try {
        const {
            vehicle_id,
            event_id,
            fee_id,
            timestamp,
            amount,
            is_paid = false,
            paid_at
        } = req.body;

        if (!vehicle_id || !fee_id || amount === undefined) {
            res.status(400).json({
                success: false,
                error: 'Thiếu trường bắt buộc: vehicle_id, fee_id, amount'
            });
            return;
        }

        if (!isValidObjectId(vehicle_id) || !isValidObjectId(fee_id)) {
            res.status(400).json({
                success: false,
                error: 'vehicle_id hoặc fee_id không hợp lệ'
            });
            return;
        }

        if (event_id && !isValidObjectId(event_id)) {
            res.status(400).json({
                success: false,
                error: 'event_id không hợp lệ'
            });
            return;
        }

        const newFeeRecord = await FeeRecord.create({
            vehicle_id,
            event_id: event_id || undefined,
            fee_id,
            timestamp: timestamp ? new Date(timestamp) : undefined,
            amount,
            is_paid,
            paid_at: paid_at ? new Date(paid_at) : undefined
        });

        const populated = await newFeeRecord.populate(['vehicle_id', 'event_id', 'fee_id']);

        res.status(201).json({
            success: true,
            data: populated
        });
    } catch (error) {
        console.error('Error creating fee record:', error);
        internalError(res, 'Không thể tạo giao dịch phí');
    }
});

// PUT /fee-record/:id - update fee record
feeRecordRouter.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const payload: any = {};
        const updatableFields = ['vehicle_id', 'event_id', 'fee_id', 'timestamp', 'amount', 'is_paid', 'paid_at'];

        for (const field of updatableFields) {
            if (req.body[field] !== undefined) {
                if (['vehicle_id', 'event_id', 'fee_id'].includes(field)) {
                    if (!isValidObjectId(req.body[field])) {
                        res.status(400).json({
                            success: false,
                            error: `${field} không hợp lệ`
                        });
                        return;
                    }
                    payload[field] = req.body[field];
                } else if (['timestamp', 'paid_at'].includes(field)) {
                    payload[field] = req.body[field] ? new Date(req.body[field]) : undefined;
                } else {
                    payload[field] = req.body[field];
                }
            }
        }

        if (Object.keys(payload).length === 0) {
            res.status(400).json({
                success: false,
                error: 'Không có dữ liệu để cập nhật'
            });
            return;
        }

        const updatedFeeRecord = await FeeRecord.findByIdAndUpdate(
            id,
            { $set: payload },
            { new: true, runValidators: true }
        ).populate(['vehicle_id', 'event_id', 'fee_id']);

        if (!updatedFeeRecord) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy giao dịch phí'
            });
            return;
        }

        res.json({
            success: true,
            data: updatedFeeRecord
        });
    } catch (error) {
        console.error('Error updating fee record:', error);
        internalError(res, 'Không thể cập nhật giao dịch phí');
    }
});

// DELETE /fee-record/:id - delete fee record
feeRecordRouter.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const deleted = await FeeRecord.findByIdAndDelete(id);

        if (!deleted) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy giao dịch phí'
            });
            return;
        }

        res.json({
            success: true,
            message: 'Xóa giao dịch phí thành công'
        });
    } catch (error) {
        console.error('Error deleting fee record:', error);
        internalError(res, 'Không thể xóa giao dịch phí');
    }
});

export default feeRecordRouter;


