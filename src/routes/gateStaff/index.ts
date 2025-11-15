import express from 'express';
import cameraRouter from './camera';
import { internalError } from '../../utils/index';
import { GateStaff } from '../../models/gateStaffModel';
import anprRouter from './anpr';
import rfidRouter from './rfidReader';
import multer from 'multer';
import { uploadBufferToCloudinary } from '../../utils/cloudinary';

const gateStaffRouter = express.Router();

interface AuthenticatedRequest extends express.Request {
    userRecord?: any;
    file?: {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
    };
}

// GET /gate-staff/me - Get current gate staff
gateStaffRouter.get('/me', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    try {
        const uid = (req as any)?.userRecord?.uid;

        if (!uid) {
            res.status(401).json({
                success: false,
                error: 'Không được phép: thiếu thông tin người dùng'
            });
            return;
        }

        const gateStaff = await GateStaff.findOne({ uid, isActive: true });

        if (!gateStaff) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy nhân viên cổng'
            });
            return;
        }

        // Transform data to include email from Firebase user record
        const transformedGateStaff = {
            _id: gateStaff._id,
            uid: gateStaff.uid,
            fullName: gateStaff.fullName,
            phone: gateStaff.phone,
            email: (req as any)?.userRecord?.email || null,
            urlImage: gateStaff.urlImage || null,
            isActive: gateStaff.isActive,
            createdAt: gateStaff.createdAt,
            updatedAt: gateStaff.updatedAt
        };

        res.json({
            success: true,
            data: transformedGateStaff
        });
    } catch (error) {
        console.error('Error fetching current gate staff:', error);
        internalError(res, 'Không thể lấy thông tin nhân viên cổng hiện tại');
    }
});

// PUT /gate-staff/me - Update current gate staff profile
gateStaffRouter.put('/me', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    try {
        const uid = (req as any)?.userRecord?.uid;

        if (!uid) {
            res.status(401).json({
                success: false,
                error: 'Không được phép: thiếu thông tin người dùng'
            });
            return;
        }

        const { fullName, phone, urlImage } = req.body;

        // Find the gate staff
        const gateStaff = await GateStaff.findOne({ uid, isActive: true });

        if (!gateStaff) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy nhân viên cổng'
            });
            return;
        }

        // Update fields if provided
        if (fullName !== undefined) {
            if (!fullName || fullName.trim() === '') {
                res.status(400).json({
                    success: false,
                    error: 'Họ và tên không được để trống'
                });
                return;
            }
            gateStaff.fullName = fullName.trim();
        }

        if (phone !== undefined) {
            if (!phone || phone.trim() === '') {
                res.status(400).json({
                    success: false,
                    error: 'Số điện thoại không được để trống'
                });
                return;
            }
            gateStaff.phone = phone.trim();
        }

        if (urlImage !== undefined) {
            gateStaff.urlImage = urlImage || null;
        }

        // Save the updated gate staff
        await gateStaff.save();

        // Transform data to include email from Firebase user record
        const transformedGateStaff = {
            _id: gateStaff._id,
            uid: gateStaff.uid,
            fullName: gateStaff.fullName,
            phone: gateStaff.phone,
            email: (req as any)?.userRecord?.email || null,
            urlImage: gateStaff.urlImage || null,
            isActive: gateStaff.isActive,
            createdAt: gateStaff.createdAt,
            updatedAt: gateStaff.updatedAt
        };

        res.json({
            success: true,
            message: 'Cập nhật thông tin thành công',
            data: transformedGateStaff
        });
    } catch (error) {
        console.error('Error updating gate staff:', error);
        internalError(res, 'Không thể cập nhật thông tin nhân viên cổng');
    }
});

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// POST /gate-staff/upload-avatar - Upload avatar image
gateStaffRouter.post('/upload-avatar', upload.single('image'), async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({
                success: false,
                error: 'Không có file được tải lên'
            });
            return;
        }

        // Validate file type
        if (!req.file.mimetype.startsWith('image/')) {
            res.status(400).json({
                success: false,
                error: 'File phải là hình ảnh'
            });
            return;
        }

        // Validate file size (max 5MB)
        if (req.file.size > 5 * 1024 * 1024) {
            res.status(400).json({
                success: false,
                error: 'Kích thước file không được vượt quá 5MB'
            });
            return;
        }

        // Upload to Cloudinary
        const imageUrl = await uploadBufferToCloudinary(req.file.buffer, {
            folder: 'qlbx/profiles',
            resource_type: 'image',
            transformation: [
                { width: 400, height: 400, crop: 'fill', gravity: 'face' },
                { quality: 'auto', fetch_format: 'auto' }
            ]
        });

        res.json({
            success: true,
            data: {
                url: imageUrl
            }
        });
    } catch (error: any) {
        console.error('Error uploading avatar:', error);
        internalError(res, 'Không thể tải hình ảnh lên');
    }
});

// Use camera routes
gateStaffRouter.use('/camera', cameraRouter);

// Use ANPR routes
gateStaffRouter.use('/anpr', anprRouter);

// Use RFID reader routes
gateStaffRouter.use('/rfid', rfidRouter);

export default gateStaffRouter;