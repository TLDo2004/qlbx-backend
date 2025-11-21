import express from 'express';
import mongoose from 'mongoose';
import { Event, Fee, FeeRecord } from '../models';
import { internalError } from '../utils';

const feeRecordRouter = express.Router();

// helper validate objectid
const isValidObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

// GET /fee-record - list all fee records
feeRecordRouter.get('/', async (_req, res) => {
    try {
        const feeRecords = await FeeRecord.find()
            .populate({
                path: 'vehicle_id',
                populate: {
                    path: 'companyId',
                    select: 'name'
                }
            })
            .populate('fee_id')
            .populate('transaction_id')
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
            .populate({
                path: 'vehicle_id',
                populate: {
                    path: 'companyId',
                    select: 'name'
                }
            })
            .populate('fee_id')
            .populate('transaction_id');

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
            transaction_id,
            timestamp,
            amount,
            is_paid = false,
            paid_at,
            parking_time
        } = req.body;

        if (!vehicle_id || !fee_id) {
            res.status(400).json({
                success: false,
                error: 'Thiếu trường bắt buộc: vehicle_id, fee_id'
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

        if (transaction_id && !isValidObjectId(transaction_id)) {
            res.status(400).json({
                success: false,
                error: 'transaction_id không hợp lệ'
            });
            return;
        }

        const fee = await Fee.findById(fee_id);

        if (!fee) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy biểu phí'
            });
            return;
        }

        const resolvedAmount = amount !== undefined ? amount : fee.amount;

        if (resolvedAmount === undefined) {
            res.status(400).json({
                success: false,
                error: 'Không xác định được số tiền cho giao dịch phí'
            });
            return;
        }

        if (resolvedAmount < 0) {
            res.status(400).json({
                success: false,
                error: 'amount phải >= 0'
            });
            return;
        }

        if (parking_time !== undefined && parking_time < 0) {
            res.status(400).json({
                success: false,
                error: 'parking_time phải >= 0'
            });
            return;
        }

        const newFeeRecord = await FeeRecord.create({
            vehicle_id,
            fee_id,
            transaction_id: transaction_id || undefined,
            timestamp: timestamp ? new Date(timestamp) : undefined,
            amount: resolvedAmount,
            is_paid,
            paid_at: paid_at ? new Date(paid_at) : undefined,
            parking_time: parking_time !== undefined ? parking_time : undefined
        });

        if (event_id) {
            await Event.findByIdAndUpdate(event_id, { feeRecord_id: newFeeRecord._id });
        }

        const populated = await newFeeRecord.populate([
            {
                path: 'vehicle_id',
                populate: {
                    path: 'companyId',
                    select: 'name'
                }
            },
            'fee_id',
            'transaction_id'
        ]);

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
        const updatableFields = ['vehicle_id', 'fee_id', 'transaction_id', 'timestamp', 'amount', 'is_paid', 'paid_at', 'parking_time'];
        const eventIdUpdateRequested = Object.prototype.hasOwnProperty.call(req.body, 'event_id');
        const nextEventId = req.body?.event_id;

        if (eventIdUpdateRequested) {
            if (nextEventId && !isValidObjectId(nextEventId)) {
                res.status(400).json({
                    success: false,
                    error: 'event_id không hợp lệ'
                });
                return;
            }
        }

        for (const field of updatableFields) {
            if (req.body[field] !== undefined) {
                if (['vehicle_id', 'fee_id', 'transaction_id'].includes(field)) {
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
                } else if (field === 'parking_time') {
                    if (req.body[field] < 0) {
                        res.status(400).json({
                            success: false,
                            error: 'parking_time phải >= 0'
                        });
                        return;
                    }
                    payload[field] = req.body[field];
                } else {
                    payload[field] = req.body[field];
                }
            }
        }

        if (!eventIdUpdateRequested && Object.keys(payload).length === 0) {
            res.status(400).json({
                success: false,
                error: 'Không có dữ liệu để cập nhật'
            });
            return;
        }

        let updatedFeeRecord = null;
        if (Object.keys(payload).length > 0) {
            updatedFeeRecord = await FeeRecord.findByIdAndUpdate(
                id,
                { $set: payload },
                { new: true, runValidators: true }
            );
        } else {
            updatedFeeRecord = await FeeRecord.findById(id);
        }

        if (!updatedFeeRecord) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy giao dịch phí'
            });
            return;
        }

        if (eventIdUpdateRequested) {
            await Event.updateMany(
                { feeRecord_id: updatedFeeRecord._id },
                { $unset: { feeRecord_id: '' } }
            );

            if (nextEventId) {
                const updatedEvent = await Event.findByIdAndUpdate(
                    nextEventId,
                    { feeRecord_id: updatedFeeRecord._id },
                    { new: true }
                );

                if (!updatedEvent) {
                    res.status(404).json({
                        success: false,
                        error: 'Không tìm thấy sự kiện để liên kết'
                    });
                    return;
                }
            }
        }

        updatedFeeRecord = await updatedFeeRecord.populate([
            {
                path: 'vehicle_id',
                populate: {
                    path: 'companyId',
                    select: 'name'
                }
            },
            'fee_id',
            'transaction_id'
        ]);

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

        await Event.updateMany(
            { feeRecord_id: deleted._id },
            { $unset: { feeRecord_id: '' } }
        );

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


