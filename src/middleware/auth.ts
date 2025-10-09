import { Request, Response, NextFunction } from 'express';
import firebaseAdmin from '../services/_firebaseservice';
import { unauthorized } from '../utils/index';
import { Employee, Permission, GateStaff } from '../models';

interface AuthenticatedRequest extends Request {
    userRecord?: any;
    userRole?: string[];
    userPermissions?: {
        permission_id: string;
        permission_name: string;
    }[];
}

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
        req.userRole = ['Admin'];
        return next();
    }

    if (token === process.env.GATE_STAFF_API_KEY) {
        req.userRecord = { uid: 'gate_staff_api_key' };
        req.userRole = ['gate_staff'];
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
        let employeeData: any[] = [];
        let gateStaffData: any[] = [];
        try {
            // Find all employees
            const employeeResult = await Employee.find({ uid: uid, isActive: true })
                .populate('roleId')
                .exec();

            // Find employee has admin role
            const adminResult = await Employee.find({ uid: uid, isActive: true, roleId: { $exists: true, $ne: null } })
                .populate('roleId')
                .where({ 'roleId.roleName': 'Admin' })
                .exec();

            //Find gate staff
            const gateResult = await GateStaff.find({ uid: uid, isActive: true })
                .exec();

            employeeData = [...employeeResult, ...adminResult];
            gateStaffData = [...gateResult];
        } catch (dbError) {
            throw dbError;
        }

        const role: string[] = [];
        const permissions: {
            permission_id: string;
            permission_name: string;
        }[] = [];

        // Check if data gate staff is not empty
        if (gateStaffData && gateStaffData.length !== 0) {
            role.push('gate_staff');
        }

        // Check if data employee is not empty
        if (employeeData && employeeData.length !== 0) {
            role.push('Employee');
        }

        // Filter out employees with roleId that is not null
        const validEmployees = employeeData.filter(emp => emp.roleId !== null);

        // Check each role
        for (const emp of validEmployees) {
            if (emp.roleId && emp.roleId.roleName) {
                switch (emp.roleId.roleName) {
                    case 'Admin':
                        if (!role.includes('Admin')) {
                            role.push('Admin');
                        }
                        // Admin has all permissions
                        try {
                            const allPermissions = await Permission.find({});
                            allPermissions.forEach(permission => {
                                permissions.push({
                                    permission_id: permission._id.toString(),
                                    permission_name: permission.permissionName
                                });
                            });
                        } catch (error) {
                            console.error('Error fetching all permissions for Admin:', error);
                        }
                        break;
                    default:
                        if (!role.includes(emp.roleId.roleName)) {
                            role.push(emp.roleId.roleName);
                        }
                        if (emp.roleId.permissionId) {
                            // Populate permissions for employee
                            try {
                                const managementPermissions = await Permission.find({
                                    _id: { $in: emp.roleId.permissionId }
                                });
                                managementPermissions.forEach(permission => {
                                    permissions.push({
                                        permission_id: permission._id.toString(),
                                        permission_name: permission.permissionName
                                    });
                                });
                            } catch (error) {
                                console.error('Error fetching permissions for Employee:', error);
                            }
                        }
                        break;
                }
            }
        }
        req.userRole = role;
        req.userPermissions = permissions;
        next();
    } catch (error) {
        unauthorized(res, `Unable to get user ${uid}`);
        return;
    }
};

export default authMiddleware; 