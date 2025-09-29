import { Request, Response, NextFunction } from 'express';
import firebaseAdmin from '../services/_firebaseservice';
import { unauthorized } from '../utils/index';
import { Employee } from '../models/Employee';
import { Permission } from '../models/Permission';

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
        let employeeData: any[];
        try {
            // Find employee with management staff role
            const managerResult = await Employee.find({ uid: uid, isActive: true })
                .populate({
                    path: 'roleId',
                    match: { roleName: 'Management staff' }
                })
                .exec();

            //Find employee with gate staff role
            const gateResult = await Employee.find({ uid: uid, isActive: true })
                .populate({
                    path: 'roleId',
                    match: { roleName: 'Gate staff' }
                })
                .exec();

            //Find employee with admin role
            const adminResult = await Employee.find({ uid: uid, isActive: true })
                .populate({
                    path: 'roleId',
                    match: { roleName: 'Admin' }
                })
                .exec();
            employeeData = [...adminResult, ...gateResult, ...managerResult];
        } catch (dbError) {
            throw dbError;
        }

        const role: string[] = [];
        const permissions: {
            permission_id: string;
            permission_name: string;
        }[] = [];

        // Check if data is empty
        if (!employeeData || employeeData.length === 0) {
            req.userRole = role;
            next();
            return;
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
                                    permission_id: permission.permissionId.toString(),
                                    permission_name: permission.permissionName
                                });
                            });
                        } catch (error) {
                            console.error('Error fetching all permissions for Admin:', error);
                        }
                        break;
                    case 'Gate staff':
                        if (!role.includes('Gate staff')) {
                            role.push('Gate staff');
                        }
                        if (emp.roleId.permissionId) {
                            // Populate permissions for gate staff
                            try {
                                const gatePermissions = await Permission.find({
                                    _id: { $in: emp.roleId.permissionId }
                                });
                                gatePermissions.forEach(permission => {
                                    permissions.push({
                                        permission_id: permission.permissionId.toString(),
                                        permission_name: permission.permissionName
                                    });
                                });
                            } catch (error) {
                                console.error('Error fetching permissions for Gate staff:', error);
                            }
                        }
                        break;
                    case 'Management staff':
                        if (!role.includes('Management staff')) {
                            role.push('Management staff');
                        }
                        if (emp.roleId.permissionId) {
                            // Populate permissions for management staff
                            try {
                                const managementPermissions = await Permission.find({
                                    _id: { $in: emp.roleId.permissionId }
                                });
                                managementPermissions.forEach(permission => {
                                    permissions.push({
                                        permission_id: permission.permissionId.toString(),
                                        permission_name: permission.permissionName
                                    });
                                });
                            } catch (error) {
                                console.error('Error fetching permissions for Management staff:', error);
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