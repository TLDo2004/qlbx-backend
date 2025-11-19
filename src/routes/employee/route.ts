import express from 'express';
import mongoose from 'mongoose';
import { Route } from '../../models';
import { internalError } from '../../utils';

const routeRouter = express.Router();

// GET /employee/route - list all routes
routeRouter.get('/', async (_req, res) => {
    try {
        const routes = await Route.find().sort({ name: 1 });
        res.json({
            success: true,
            data: routes
        });
    } catch (error) {
        console.error('Error fetching routes:', error);
        internalError(res, 'Không thể lấy danh sách tuyến');
    }
});

// GET /employee/route/:id - get route by id
routeRouter.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const route = await Route.findById(id);

        if (!route) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy tuyến'
            });
            return;
        }

        res.json({
            success: true,
            data: route
        });
    } catch (error) {
        console.error('Error fetching route:', error);
        internalError(res, 'Không thể lấy thông tin tuyến');
    }
});

// POST /employee/route - create route (distance optional)
routeRouter.post('/', async (req, res) => {
    try {
        const { name, origin, destination } = req.body;

        if (!name || !origin || !destination) {
            res.status(400).json({
                success: false,
                error: 'Thiếu trường bắt buộc: name, origin, destination'
            });
            return;
        }

        const newRoute = await Route.create({
            name,
            origin,
            destination
        });

        res.status(201).json({
            success: true,
            data: newRoute
        });
    } catch (error: any) {
        console.error('Error creating route:', error);

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                error: 'Tên tuyến đã tồn tại'
            });
            return;
        }

        internalError(res, 'Không thể tạo tuyến');
    }
});

// PUT /employee/route/:id - update route
routeRouter.put('/:id', async (req, res) => {
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
        const updatableFields = ['name', 'origin', 'destination'];

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

        const updatedRoute = await Route.findByIdAndUpdate(
            id,
            { $set: payload },
            { new: true, runValidators: true }
        );

        if (!updatedRoute) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy tuyến'
            });
            return;
        }

        res.json({
            success: true,
            data: updatedRoute
        });
    } catch (error: any) {
        console.error('Error updating route:', error);

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                error: 'Tên tuyến đã tồn tại'
            });
            return;
        }

        internalError(res, 'Không thể cập nhật tuyến');
    }
});

// DELETE /employee/route/:id - delete route
routeRouter.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const deleted = await Route.findByIdAndDelete(id);

        if (!deleted) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy tuyến'
            });
            return;
        }

        res.json({
            success: true,
            message: 'Xóa tuyến thành công'
        });
    } catch (error) {
        console.error('Error deleting route:', error);
        internalError(res, 'Không thể xóa tuyến');
    }
});

export default routeRouter;


