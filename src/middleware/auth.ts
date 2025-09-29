import { Request, Response, NextFunction } from 'express';
import firebaseAdmin from '../services/_firebaseservice';
import { unauthorized } from '../utils/index';
import { Employee } from '../models/Employee';

interface AuthenticatedRequest extends Request {
    userRecord?: any;
    userRole?: string[];}

const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        unauthorized(res, 'No authorization header found.');
        return;
    }

    // Extract token from "Bearer <token>" format - always strip "Bearer " if present
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
        unauthorized(res, 'No token found in authorization header.');
        return;
    }

    let uid: string | null = null;

    // Check if this is an admin API key
    if (token === process.env.ADMIN_API_KEY) {
        req.userRecord = { uid: 'admin_api_key' };
        req.userRole = ['admin'];
        return next();
    }

    // Verify Firebase token
    try {
        const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
        uid = decodedToken?.uid;
    } catch (error) {
        unauthorized(res, `Unable to verify token ${token}`);
        return;
    }

    // Check if uid is null
    if (!uid) {
        unauthorized(res, `Unable to get uid from token ${uid}`);
        return;
    }

    // Get userRecord from uid
    try {
        const userRecord = await firebaseAdmin.auth().getUser(uid);
        if (!userRecord) {
            unauthorized(res);
            return;
        }
        req.userRecord = userRecord;

        // Query MongoDB collections
        let employeeData;
        try {
            employeeData = await Employee.findOne({ uid: uid, isActive: true });
        } catch (dbError) {
            throw dbError;
        }

        const role: string[] = [];

        // Check if user is an employee
        if (employeeData) {
            role.push('employee');
        }

        req.userRole = role;
        next();
    } catch (error) {
        unauthorized(res, `Unable to get user ${uid}`);
        return;
    }
};

export default authMiddleware; 