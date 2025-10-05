import express from 'express';
import { GateStaff } from '../../models';
import { createUserAndSendWelcomeEmail } from '../../services/_firebaseservice';

const gateStaffRouter = express.Router();

//POST /employee/gateStaff - create a new gate staff
gateStaffRouter.post('/', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { fullName, phone, email } = req.body;

    // Validate required fields
    if (!fullName || !phone || !email) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: fullName, phone, email'
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
      return;
    }

    // Create Firebase user and send welcome email with reset password link
    const userResult = await createUserAndSendWelcomeEmail(
      { email },
      fullName
    );

    // Create gate staff record in MongoDB with Firebase UID
    let gateStaff;
    try {
      gateStaff = await GateStaff.create({
        uid: userResult.uid,
        fullName,
        phone,
      });
    } catch (createError) {
      console.error('Error creating gate staff in MongoDB:', createError);
      throw createError;
    }

    // Transform data to match gate staff format
    const transformedData = {
      _id: gateStaff._id,
      uid: gateStaff.uid,
      fullName: gateStaff.fullName,
      phone: gateStaff.phone,
      email: userResult.email,
      isActive: gateStaff.isActive,
      createdAt: gateStaff.createdAt,
      updatedAt: gateStaff.updatedAt
    };

    res.status(201).json({
      success: true,
      message: 'Gate staff created successfully and welcome email sent',
      data: transformedData
    });
  } catch (error: any) {
    console.error('Error creating gate staff:', error);

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
        error: 'Gate staff with this information already exists'
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
      error: 'Failed to create gate staff',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default gateStaffRouter;