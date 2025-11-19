import express from 'express';
import mongoose from 'mongoose';
import { BusCompany } from '../../models';
import { internalError } from '../../utils';

const busCompanyRouter = express.Router();

// GET /employee/bus-company - list all bus companies
busCompanyRouter.get('/', async (_req, res) => {
    try {
        const companies = await BusCompany.find().sort({ name: 1 });
        res.json({
            success: true,
            data: companies
        });
    } catch (error) {
        console.error('Error fetching bus companies:', error);
        internalError(res, 'Không thể lấy danh sách nhà xe');
    }
});

// GET /employee/bus-company/:id - get company by id
busCompanyRouter.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const company = await BusCompany.findById(id);

        if (!company) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy nhà xe'
            });
            return;
        }

        res.json({
            success: true,
            data: company
        });
    } catch (error) {
        console.error('Error fetching bus company:', error);
        internalError(res, 'Không thể lấy thông tin nhà xe');
    }
});

// POST /employee/bus-company - create new bus company
busCompanyRouter.post('/', async (req, res) => {
    try {
        const {
            name,
            tax_code,
            address,
            phone,
            contract_start,
            contract_end,
            is_active = true
        } = req.body;

        if (!name || !tax_code || !address || !phone || !contract_start || !contract_end) {
            res.status(400).json({
                success: false,
                error: 'Thiếu trường bắt buộc: name, tax_code, address, phone, contract_start, contract_end'
            });
            return;
        }

        const newCompany = await BusCompany.create({
            name,
            tax_code,
            address,
            phone,
            contract_start: new Date(contract_start),
            contract_end: new Date(contract_end),
            is_active
        });

        res.status(201).json({
            success: true,
            data: newCompany
        });
    } catch (error: any) {
        console.error('Error creating bus company:', error);

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                error: 'Tên hoặc mã số thuế đã tồn tại'
            });
            return;
        }

        internalError(res, 'Không thể tạo nhà xe');
    }
});

// PUT /employee/bus-company/:id - update bus company
busCompanyRouter.put('/:id', async (req, res) => {
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
        const updatableFields = ['name', 'tax_code', 'address', 'phone', 'contract_start', 'contract_end', 'is_active'];

        updatableFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                if (field === 'contract_start' || field === 'contract_end') {
                    payload[field] = new Date(req.body[field]);
                } else {
                    payload[field] = req.body[field];
                }
            }
        });

        if (Object.keys(payload).length === 0) {
            res.status(400).json({
                success: false,
                error: 'Không có dữ liệu để cập nhật'
            });
            return;
        }

        const updatedCompany = await BusCompany.findByIdAndUpdate(
            id,
            { $set: payload },
            { new: true, runValidators: true }
        );

        if (!updatedCompany) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy nhà xe'
            });
            return;
        }

        res.json({
            success: true,
            data: updatedCompany
        });
    } catch (error: any) {
        console.error('Error updating bus company:', error);

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                error: 'Tên hoặc mã số thuế đã tồn tại'
            });
            return;
        }

        internalError(res, 'Không thể cập nhật nhà xe');
    }
});

// DELETE /employee/bus-company/:id - delete bus company
busCompanyRouter.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const deleted = await BusCompany.findByIdAndDelete(id);

        if (!deleted) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy nhà xe'
            });
            return;
        }

        res.json({
            success: true,
            message: 'Xóa nhà xe thành công'
        });
    } catch (error) {
        console.error('Error deleting bus company:', error);
        internalError(res, 'Không thể xóa nhà xe');
    }
});

export default busCompanyRouter;


