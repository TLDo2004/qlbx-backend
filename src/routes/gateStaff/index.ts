import express from 'express';
import cameraRouter from './camera';
import { internalError } from '../../utils/index';
import { GateStaff } from '../../models/gateStaffModel';
import anprRouter from './anpr';
import rfidRouter from './rfidReader';

const gateStaffRouter = express.Router();

interface AuthenticatedRequest extends express.Request {
    userRecord?: any;
}

// GET /gate-staff/me - Get current gate staff
gateStaffRouter.get('/me', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    try {
        const uid = (req as any)?.userRecord?.uid;

        if (!uid) {
            res.status(401).json({
                success: false,
                error: 'Unauthorized: missing user context'
            });
            return;
        }

        const gateStaff = await GateStaff.findOne({ uid, isActive: true });

        if (!gateStaff) {
            res.status(404).json({
                success: false,
                error: 'Gate staff not found'
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
        internalError(res, 'Failed to fetch current gate staff');
    }
});

// Use camera routes
gateStaffRouter.use('/camera', cameraRouter);

// Use ANPR routes
gateStaffRouter.use('/anpr', anprRouter);

// Use RFID reader routes
gateStaffRouter.use('/rfid', rfidRouter);

export default gateStaffRouter;