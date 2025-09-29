import { Request, Response, NextFunction } from 'express';
import { forbidden } from '../utils/index';

interface AuthenticatedRequest extends Request {
    userRecord?: any;
    userRole?: string[];
}

const adminAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.userRole?.includes('admin')) {
        next();
    } else {
        forbidden(res, 'Insufficient Permission. Please contact Admin.');
    }
};

export default adminAuth;
