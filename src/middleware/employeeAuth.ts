import { Request, Response, NextFunction } from 'express';
import { forbidden } from '../utils/index';

interface AuthenticatedRequest extends Request {
    userRecord?: any;
    userRole?: string[];
}

const employeeAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.userRole?.includes('Employee')) {
        next();
    } else {
        forbidden(res, 'Insufficient Permission. Please contact Admin.');
    }
};

export default employeeAuth;
