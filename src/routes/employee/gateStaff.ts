import express from 'express';
import { GateStaff } from '../../models';
import { createUserAndSendWelcomeEmail, getFirebaseUserByUid } from '../../services/_firebaseservice';
import { adminAuth } from '../../middleware';
import { internalError } from '../../utils';

const gateStaffRouter = express.Router();

//GET /employee/gate-staff/list - Get all gate staff with pagination, search, and filter
gateStaffRouter.get('/list', adminAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string || '';
    const status = req.query.status as string || 'all'; // 'all', 'active', 'inactive'

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

    // Filter by search term (search in fullName, phone)
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { fullName: searchRegex },
        { phone: searchRegex }
      ];
    }

    // Get total count for pagination info
    const totalGateStaff = await GateStaff.countDocuments(filter);
    const totalPages = Math.ceil(totalGateStaff / limit);

    // Get gate staff with pagination
    const gateStaffList = await GateStaff.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Transform data to include email from Firebase
    const transformedGateStaff = await Promise.all(gateStaffList.map(async (gs) => {
      const firebaseUser = await getFirebaseUserByUid(gs.uid);
      return {
        _id: gs._id,
        uid: gs.uid,
        fullName: gs.fullName,
        phone: gs.phone,
        email: firebaseUser?.email || null,
        urlImage: gs.urlImage || null,
        isActive: gs.isActive,
        createdAt: gs.createdAt,
        updatedAt: gs.updatedAt
      };
    }));

    res.json({
      success: true,
      data: transformedGateStaff,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalGateStaff,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching gate staff:', error);
    internalError(res, 'Không thể lấy danh sách nhân viên cổng');
  }
});

//POST /employee/gateStaff - create a new gate staff
gateStaffRouter.post('/', adminAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { fullName, phone, email, urlImage } = req.body;

    // Validate required fields
    if (!fullName || !phone || !email) {
      res.status(400).json({
        success: false,
        error: 'Thiếu các trường bắt buộc: fullName, phone, email'
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        error: 'Định dạng email không hợp lệ'
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
        urlImage: urlImage || undefined
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
      urlImage: gateStaff.urlImage || null,
      isActive: gateStaff.isActive,
      createdAt: gateStaff.createdAt,
      updatedAt: gateStaff.updatedAt
    };

    res.status(201).json({
      success: true,
      message: 'Tạo nhân viên cổng thành công và đã gửi email chào mừng',
      data: transformedData
    });
  } catch (error: any) {
    console.error('Error creating gate staff:', error);

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
        error: 'Nhân viên cổng với thông tin này đã tồn tại'
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
      error: 'Không thể tạo nhân viên cổng',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default gateStaffRouter;