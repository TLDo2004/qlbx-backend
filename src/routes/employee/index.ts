import express from 'express';
import { Employee, Role } from '../../models';
import { internalError } from '../../utils';
import { adminAuth } from '../../middleware/index';
import mongoose from 'mongoose';
import { createUserAndSendWelcomeEmail, getFirebaseUserByUid } from '../../services/_firebaseservice';
import gateStaffRouter from './gateStaff';
import roleRouter from './role';
import busCompanyRouter from './busCompany';
import routeRouter from './route';

interface IEmployeeRequest extends express.Request {
  body: {
    fullName: string;
    phone: string;
    roleId: string;
    email: string;
    urlImage?: string;
  };
}

const employeeRouter = express.Router();

//GET /employee/list - Get all employees with pagination, search, and filter
employeeRouter.get('/list', adminAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string || '';
    const status = req.query.status as string || 'all';
    const role = req.query.role as string || 'all'; 

    // Validate pagination parameters
    if (page < 1) {
      res.status(400).json({
        success: false,
        error: 'Số trang phải lớn hơn 0'
      });
      return;
    }

    if (limit < 1 || limit > 100) {
      res.status(400).json({
        success: false,
        error: 'Giới hạn phải từ 1 đến 100'
      });
      return;
    }

    // Calculate skip value
    const skip = (page - 1) * limit;

    // Build filter query
    const filter: any = {};

    // Filter by status
    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'inactive') {
      filter.isActive = false;
    }
    // If status is 'all', don't add isActive filter

    // Filter by role
    if (role !== 'all' && role.trim()) {
      // Find role by roleName (case insensitive)
      const roleDoc = await Role.findOne({
        roleName: { $regex: new RegExp(`^${role.trim()}$`, 'i') }
      });

      if (roleDoc) {
        filter.roleId = roleDoc._id;
      } else {
        // If role not found, return empty result
        res.json({
          success: true,
          data: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: limit,
            hasNextPage: false,
            hasPrevPage: false
          }
        });
        return;
      }
    }

    // Filter by search term (search in fullName, phone)
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { fullName: searchRegex },
        { phone: searchRegex }
      ];
    }

    // Get total count for pagination info
    const totalEmployees = await Employee.countDocuments(filter);
    const totalPages = Math.ceil(totalEmployees / limit);

    // Get employees with pagination
    const employees = await Employee.find(filter)
      .populate('roleId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Transform data to include roleName and email from Firebase
    const transformedEmployees = await Promise.all(employees.map(async (emp) => {
      const firebaseUser = await getFirebaseUserByUid(emp.uid);
      return {
        _id: emp._id,
        uid: emp.uid,
        fullName: emp.fullName,
        phone: emp.phone,
        email: firebaseUser?.email || null,
        roleId: (emp.roleId as any)?._id || null,
        roleName: (emp.roleId as any)?.roleName || null,
        urlImage: emp.urlImage || null,
        isActive: emp.isActive,
        createdAt: emp.createdAt,
        updatedAt: emp.updatedAt
      };
    }));

    res.json({
      success: true,
      data: transformedEmployees,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalEmployees,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    internalError(res, 'Không thể lấy danh sách nhân viên');
  }
});

//GET /employee/me - Get current authenticated employee
employeeRouter.get('/me', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const uid = (req as any)?.userRecord?.uid;

    if (!uid) {
      res.status(401).json({
        success: false,
        error: 'Không được phép: thiếu thông tin người dùng'
      });
      return;
    }

    const employee = await Employee.findOne({ uid, isActive: true }).populate('roleId');

    if (!employee) {
      res.status(404).json({
        success: false,
        error: 'Không tìm thấy nhân viên'
      });
      return;
    }

    const transformedEmployee = {
      _id: employee._id,
      uid: employee.uid,
      fullName: employee.fullName,
      phone: employee.phone,
      email: (req as any)?.userRecord?.email || null,
      roleId: (employee.roleId as any)?._id || null,
      roleName: (employee.roleId as any)?.roleName || null,
      urlImage: employee.urlImage || null,
      isActive: employee.isActive,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt
    };

    res.json({
      success: true,
      data: transformedEmployee
    });
  } catch (error) {
    console.error('Error fetching current employee:', error);
    internalError(res, 'Không thể lấy thông tin nhân viên hiện tại');
  }
});

// Use sub-routers BEFORE the /:id route to avoid route conflicts
employeeRouter.use('/gate-staff', gateStaffRouter);
employeeRouter.use('/role', adminAuth, roleRouter);
employeeRouter.use('/bus-company', adminAuth, busCompanyRouter);
employeeRouter.use('/route', adminAuth, routeRouter);

//GET /employee/:id - Get employee by ID
employeeRouter.get('/:id', adminAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID không hợp lệ'
      });
      return;
    }
    
    const employee = await Employee.findById(id).populate('roleId');

    if (!employee) {
      res.status(404).json({
        success: false,
        error: 'Không tìm thấy nhân viên'
      });
      return;
    }

    // Get email from Firebase
    const firebaseUser = await getFirebaseUserByUid(employee.uid);

    // Transform data to include roleName and email from Firebase
    const transformedEmployee = {
      _id: employee._id,
      uid: employee.uid,
      fullName: employee.fullName,
      phone: employee.phone,
      email: firebaseUser?.email || null,
      roleId: (employee.roleId as any)?._id || null,
      roleName: (employee.roleId as any)?.roleName || null,
      urlImage: employee.urlImage || null,
      isActive: employee.isActive,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt
    };

    res.json({
      success: true,
      data: transformedEmployee
    });
  } catch (error) {
    console.error('Error fetching employee:', error);
    internalError(res, 'Không thể lấy thông tin nhân viên');
  }
});

//POST /employee - Create a new employee with Firebase user
employeeRouter.post('/', adminAuth, async (req: IEmployeeRequest, res: express.Response): Promise<void> => {
  try {
    const { fullName, phone, roleId, email, urlImage } = req.body;

    // Validate required fields
    if (!fullName || !phone || !roleId || !email) {
      res.status(400).json({
        error: 'Thiếu các trường bắt buộc: fullName, phone, roleId, email'
      });
      return;
    }

    // Validate roleId format
    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      res.status(400).json({
        error: 'Định dạng roleId không hợp lệ'
      });
      return;
    }
    const roleExists = await Role.findById(roleId);

    if (!roleExists) {
      res.status(400).json({
        error: 'Không tìm thấy vai trò',
        searchedId: roleId
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        error: 'Định dạng email không hợp lệ'
      });
      return;
    }

    // Create Firebase user and send welcome email with reset password link
    const userResult = await createUserAndSendWelcomeEmail(
      { email },
      fullName
    );

    // Create employee record in MongoDB with Firebase UID
    let employee;
    try {
      employee = await Employee.create({
        uid: userResult.uid,
        fullName,
        phone,
        roleId: new mongoose.Types.ObjectId(roleId),
        urlImage: urlImage || undefined
      });
    } catch (createError) {
      console.error('Error creating employee in MongoDB:', createError);
      throw createError;
    }

    // Populate role information
    const employeeWithRole = await Employee.findById(employee._id).populate('roleId');

    // Transform data to include roleName instead of full role object
    const transformedData = {
      _id: employeeWithRole?._id,
      uid: employeeWithRole?.uid,
      fullName: employeeWithRole?.fullName,
      phone: employeeWithRole?.phone,
      email: userResult.email,
      roleId: (employeeWithRole?.roleId as any)?._id || null,
      roleName: (employeeWithRole?.roleId as any)?.roleName || null,
      urlImage: employeeWithRole?.urlImage || null,
      isActive: employeeWithRole?.isActive,
      createdAt: employeeWithRole?.createdAt,
      updatedAt: employeeWithRole?.updatedAt
    };

    res.status(201).json({
      success: true,
      message: 'Tạo nhân viên thành công và đã gửi email chào mừng',
      data: transformedData
    });
  } catch (error: any) {
    console.error('Error creating employee:', error);

    // Handle specific Firebase errors
    if (error.message?.includes('Email already exists')) {
      res.status(409).json({
        success: false,
        error: 'Email đã tồn tại trong hệ thống'
      });
      return;
    }

    if (error.message?.includes('Invalid email')) {
      res.status(400).json({
        success: false,
        error: 'Địa chỉ email không hợp lệ'
      });
      return;
    }

    // Handle MongoDB errors
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        error: 'Nhân viên với thông tin này đã tồn tại'
      });
      return;
    }

    // Handle Resend package not found
    if (error.message?.includes('Resend package not found')) {
      res.status(500).json({
        success: false,
        error: 'Dịch vụ email không khả dụng. Vui lòng cài đặt gói resend.'
      });
      return;
    }

    // Handle Firebase connection errors
    if (error.message?.includes('Firebase')) {
      res.status(500).json({
        success: false,
        error: 'Lỗi dịch vụ Firebase: ' + error.message
      });
      return;
    }

    // Generic error response with more details
    res.status(500).json({
      success: false,
      error: 'Không thể tạo nhân viên',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default employeeRouter;