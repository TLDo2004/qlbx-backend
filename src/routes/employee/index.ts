import express from 'express';
import { Employee } from '../../models/Employee';
import { internalError } from '../../utils';
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

    res.json({
      success: true,
      data: employees
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
        error: 'Employee not found'
      });
      return;
    }

    res.json({
      success: true,
      data: employee
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
    const employee = await Employee.create({
      uid: userResult.uid,
      fullName,
      phone,
      roleId
    });

    // Populate role information
    const employeeWithRole = await Employee.findById(employee._id).populate('roleId');

    res.status(201).json({
      success: true,
      message: 'Employee created successfully and welcome email sent',
      data: {
        employee: employeeWithRole,
        firebaseUser: {
          uid: userResult.uid,
          email: userResult.email
        }
      }
    });
  } catch (error: any) {
    console.error('Error creating employee:', error);

    // Handle specific Firebase errors
    if (error.message?.includes('Email already exists')) {
      res.status(409).json({
        error: 'Email already exists in the system'
      });
      return;
    }

    if (error.message?.includes('Invalid email')) {
      res.status(400).json({
        error: 'Invalid email address'
      });
      return;
    }

    // Handle MongoDB errors
    if (error.code === 11000) {
      res.status(409).json({
        error: 'Employee with this information already exists'
      });
      return;
    }

    internalError(res, 'Failed to create employee');
  }
});

export default employeeRouter;