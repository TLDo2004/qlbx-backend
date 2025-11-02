import { Request, Response, NextFunction } from 'express';
import { forbidden } from '../utils/index';

interface AuthenticatedRequest extends Request {
    userRecord?: any;
    userRole?: string[];
}

const gateStaffAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Internal bypass using API key header for server-side calls
    const internalKey = req.header('x-internal-api-key');
    if (internalKey && process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY) {
        return next();
    }

    if (req.userRole?.includes('gate_staff')) {
        next();
    } else {
        forbidden(res, 'Insufficient Permission. Please contact Admin.');
    }
};

export default gateStaffAuth;
