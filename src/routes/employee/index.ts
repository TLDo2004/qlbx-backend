import express from 'express';
import { Employee, Role } from '../../models';
import { internalError } from '../../utils';
import mongoose from 'mongoose';
import { createUserAndSendWelcomeEmail } from '../../services/_firebaseservice';

interface IEmployeeRequest extends express.Request {
  body: {
    fullName: string;
    phone: string;
    roleId: string;
    email: string;
  };
}

const employeeRouter = express.Router();

//GET /employee - Get all employees
employeeRouter.get('/', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const employees = await Employee.find({ isActive: true })
      .populate('roleId')
      .sort({ createdAt: -1 });

    // Transform data to include roleName instead of full role object
    const transformedEmployees = employees.map(emp => ({
      _id: emp._id,
      uid: emp.uid,
      fullName: emp.fullName,
      phone: emp.phone,
      roleId: (emp.roleId as any)?._id || null,
      roleName: (emp.roleId as any)?.roleName || null,
      isActive: emp.isActive,
      createdAt: emp.createdAt,
      updatedAt: emp.updatedAt
    }));

    res.json({
      success: true,
      data: transformedEmployees
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    internalError(res, 'Failed to fetch employees');
  }
});

//GET /employee/:id - Get employee by ID
employeeRouter.get('/:id', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id).populate('roleId');

    if (!employee) {
      res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
      return;
    }

    // Transform data to include roleName instead of full role object
    const transformedEmployee = {
      _id: employee._id,
      uid: employee.uid,
      fullName: employee.fullName,
      phone: employee.phone,
      roleId: (employee.roleId as any)?._id || null,
      roleName: (employee.roleId as any)?.roleName || null,
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
    internalError(res, 'Failed to fetch employee');
  }
});

//POST /employee - Create a new employee with Firebase user
employeeRouter.post('/', async (req: IEmployeeRequest, res: express.Response): Promise<void> => {
  try {
    const { fullName, phone, roleId, email } = req.body;

    // Validate required fields
    if (!fullName || !phone || !roleId || !email) {
      res.status(400).json({
        error: 'Missing required fields: fullName, phone, roleId, email'
      });
      return;
    }

    // Validate roleId format
    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      res.status(400).json({
        error: 'Invalid roleId format'
      });
      return;
    }
    const roleExists = await Role.findById(roleId);

    if (!roleExists) {
      res.status(400).json({
        error: 'Role not found',
        searchedId: roleId
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        error: 'Invalid email format'
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
        roleId: new mongoose.Types.ObjectId(roleId)
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
      isActive: employeeWithRole?.isActive,
      createdAt: employeeWithRole?.createdAt,
      updatedAt: employeeWithRole?.updatedAt
    };

    res.status(201).json({
      success: true,
      message: 'Employee created successfully and welcome email sent',
      data: transformedData
    });
  } catch (error: any) {
    console.error('Error creating employee:', error);

    // Handle specific Firebase errors
    if (error.message?.includes('Email already exists')) {
      res.status(409).json({
        success: false,
        error: 'Email already exists in the system'
      });
      return;
    }

    if (error.message?.includes('Invalid email')) {
      res.status(400).json({
        success: false,
        error: 'Invalid email address'
      });
      return;
    }

    // Handle MongoDB errors
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        error: 'Employee with this information already exists'
      });
      return;
    }

    // Handle Resend package not found
    if (error.message?.includes('Resend package not found')) {
      res.status(500).json({
        success: false,
        error: 'Email service not available. Please install resend package.'
      });
      return;
    }

    // Handle Firebase connection errors
    if (error.message?.includes('Firebase')) {
      res.status(500).json({
        success: false,
        error: 'Firebase service error: ' + error.message
      });
      return;
    }

    // Generic error response with more details
    res.status(500).json({
      success: false,
      error: 'Failed to create employee',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default employeeRouter;