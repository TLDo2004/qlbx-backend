import express from 'express';
import mongoose from 'mongoose';
import { Account } from '../models';
import { internalError } from '../utils';

const accountRouter = express.Router();

const isValidObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

// GET /account - list all accounts
accountRouter.get('/', async (_req, res) => {
    try {
        const accounts = await Account.find()
            .populate('vehicle_id')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: accounts
        });
    } catch (error) {
        console.error('Error fetching accounts:', error);
        internalError(res, 'Không thể lấy danh sách tài khoản');
    }
});

// GET /account/:id - get account by id
accountRouter.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const account = await Account.findById(id).populate('vehicle_id');

        if (!account) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài khoản'
            });
            return;
        }

        res.json({
            success: true,
            data: account
        });
    } catch (error) {
        console.error('Error fetching account:', error);
        internalError(res, 'Không thể lấy thông tin tài khoản');
    }
});

// POST /account - create account
accountRouter.post('/', async (req, res) => {
    try {
        const { vehicle_id, balance = 0, is_active = true } = req.body;

        if (!vehicle_id) {
            res.status(400).json({
                success: false,
                error: 'Thiếu trường bắt buộc: vehicle_id'
            });
            return;
        }

        if (!isValidObjectId(vehicle_id)) {
            res.status(400).json({
                success: false,
                error: 'vehicle_id không hợp lệ'
            });
            return;
        }

        const account = await Account.create({
            vehicle_id,
            balance,
            is_active
        });

        const populated = await account.populate('vehicle_id');

        res.status(201).json({
            success: true,
            data: populated
        });
    } catch (error: any) {
        console.error('Error creating account:', error);

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                error: 'Tài khoản cho phương tiện này đã tồn tại'
            });
            return;
        }

        internalError(res, 'Không thể tạo tài khoản');
    }
});

// PUT /account/:id - update account
accountRouter.put('/:id', async (req, res) => {
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
        const updatableFields = ['vehicle_id', 'balance', 'is_active'];

        for (const field of updatableFields) {
            if (req.body[field] !== undefined) {
                if (field === 'vehicle_id' && !isValidObjectId(req.body[field])) {
                    res.status(400).json({
                        success: false,
                        error: 'vehicle_id không hợp lệ'
                    });
                    return;
                }
                payload[field] = req.body[field];
            }
        }

        if (Object.keys(payload).length === 0) {
            res.status(400).json({
                success: false,
                error: 'Không có dữ liệu để cập nhật'
            });
            return;
        }

        const updatedAccount = await Account.findByIdAndUpdate(
            id,
            { $set: payload },
            { new: true, runValidators: true }
        ).populate('vehicle_id');

        if (!updatedAccount) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài khoản'
            });
            return;
        }

        res.json({
            success: true,
            data: updatedAccount
        });
    } catch (error: any) {
        console.error('Error updating account:', error);

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                error: 'Tài khoản cho phương tiện này đã tồn tại'
            });
            return;
        }

        internalError(res, 'Không thể cập nhật tài khoản');
    }
});

// DELETE /account/:id - delete account
accountRouter.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const deleted = await Account.findByIdAndDelete(id);

        if (!deleted) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài khoản'
            });
            return;
        }

        res.json({
            success: true,
            message: 'Xóa tài khoản thành công'
        });
    } catch (error) {
        console.error('Error deleting account:', error);
        internalError(res, 'Không thể xóa tài khoản');
    }
});

export default accountRouter;


