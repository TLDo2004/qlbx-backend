import express from 'express';
import mongoose from 'mongoose';
import { Fee } from '../models';
import { internalError } from '../utils';

const feeRouter = express.Router();

// GET /fee - list all fees
feeRouter.get('/', async (_req, res) => {
    try {
        const fees = await Fee.find().sort({ fee_type: 1, vehicle_type: 1 });
        res.json({
            success: true,
            data: fees
        });
    } catch (error) {
        console.error('Error fetching fees:', error);
        internalError(res, 'Không thể lấy danh sách phí');
    }
});

// GET /fee/:id - get fee by id
feeRouter.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const fee = await Fee.findById(id);

        if (!fee) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy biểu phí'
            });
            return;
        }

        res.json({
            success: true,
            data: fee
        });
    } catch (error) {
        console.error('Error fetching fee:', error);
        internalError(res, 'Không thể lấy thông tin biểu phí');
    }
});

// POST /fee - create new fee
feeRouter.post('/', async (req, res) => {
    try {
        const { fee_type, fee_name, vehicle_type, amount } = req.body;

        if (!fee_type || !fee_name || amount === undefined) {
            res.status(400).json({
                success: false,
                error: 'Thiếu trường bắt buộc: fee_type, fee_name, amount'
            });
            return;
        }

        const newFee = await Fee.create({
            fee_type,
            fee_name,
            vehicle_type,
            amount
        });

        res.status(201).json({
            success: true,
            data: newFee
        });
    } catch (error: any) {
        console.error('Error creating fee:', error);

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                error: 'Biểu phí cho loại phương tiện này đã tồn tại'
            });
            return;
        }

        internalError(res, 'Không thể tạo biểu phí');
    }
});

// PUT /fee/:id - update fee
feeRouter.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const payload: any = {};
        const updatableFields = ['fee_type', 'fee_name', 'vehicle_type', 'amount'];

        updatableFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                payload[field] = req.body[field];
            }
        });

        if (Object.keys(payload).length === 0) {
            res.status(400).json({
                success: false,
                error: 'Không có dữ liệu để cập nhật'
            });
            return;
        }

        const updatedFee = await Fee.findByIdAndUpdate(
            id,
            { $set: payload },
            { new: true, runValidators: true }
        );

        if (!updatedFee) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy biểu phí'
            });
            return;
        }

        res.json({
            success: true,
            data: updatedFee
        });
    } catch (error: any) {
        console.error('Error updating fee:', error);

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                error: 'Biểu phí cho loại phương tiện này đã tồn tại'
            });
            return;
        }

        internalError(res, 'Không thể cập nhật biểu phí');
    }
});

// DELETE /fee/:id - delete fee
feeRouter.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const deleted = await Fee.findByIdAndDelete(id);

        if (!deleted) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy biểu phí'
            });
            return;
        }

        res.json({
            success: true,
            message: 'Xóa biểu phí thành công'
        });
    } catch (error) {
        console.error('Error deleting fee:', error);
        internalError(res, 'Không thể xóa biểu phí');
    }
});

export default feeRouter;


