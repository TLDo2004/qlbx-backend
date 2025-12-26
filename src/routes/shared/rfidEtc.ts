import express from 'express';
import { RfidEtc, Vehicle } from '../../models';
import { internalError } from '../../utils';

interface IRfidEtcRequest extends express.Request {
  body: {
    rfid_etc: string;
    expiration_date: string;
    balance?: number;
    is_active?: boolean;
  };
}

const rfidEtcRouter = express.Router();

// GET /rfid-etc - Get all RFID/ETC with pagination
rfidEtcRouter.get('/', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

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

    // Get total count for pagination info (only active ones)
    const totalRfidEtc = await RfidEtc.countDocuments({ is_active: true });
    const totalPages = Math.ceil(totalRfidEtc / limit);

    // Get RFID/ETC with pagination
    const rfidEtcList = await RfidEtc.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      data: rfidEtcList,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalRfidEtc,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching RFID/ETC:', error);
    internalError(res, 'Không thể lấy danh sách RFID/ETC');
  }
});

// GET /rfid-etc/unassigned - Get all unassigned RFID/ETC (not assigned to any vehicle)
rfidEtcRouter.get('/unassigned', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

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

    // Get all rfid_etc codes that are assigned to vehicles
    const vehiclesWithRfid = await Vehicle.find({ 
      rfid_etc: { $exists: true, $ne: null, $nin: ['', null] } 
    }).select('rfid_etc');
    
    const assignedRfidEtc = vehiclesWithRfid
      .map(v => v.rfid_etc)
      .filter((rfid): rfid is string => rfid !== null && rfid !== undefined && rfid !== '');

    // Get all RFID/ETC that are NOT in the assigned list (only active ones)
    const unassignedRfidEtc = await RfidEtc.find({
      rfid_etc: { $nin: assignedRfidEtc },
      is_active: true
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination info (only active ones)
    const totalUnassigned = await RfidEtc.countDocuments({
      rfid_etc: { $nin: assignedRfidEtc },
      is_active: true
    });
    const totalPages = Math.ceil(totalUnassigned / limit);

    res.json({
      success: true,
      data: unassignedRfidEtc,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalUnassigned,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching unassigned RFID/ETC:', error);
    internalError(res, 'Không thể lấy danh sách RFID/ETC chưa được gán');
  }
});

// GET /rfid-etc/:rfid_etc - Get RFID/ETC by rfid_etc code
rfidEtcRouter.get('/:rfid_etc', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { rfid_etc } = req.params;

    // Validate rfid_etc parameter
    if (!rfid_etc || rfid_etc.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Mã RFID/ETC là bắt buộc'
      });
      return;
    }

    // Find RFID/ETC by code (only active ones)
    const rfidEtc = await RfidEtc.findOne({ 
      rfid_etc: rfid_etc.trim(),
      is_active: true
    });

    if (!rfidEtc) {
      res.status(404).json({
        success: false,
        error: 'Không tìm thấy RFID/ETC'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        _id: rfidEtc._id,
        rfid_etc: rfidEtc.rfid_etc,
        expiration_date: rfidEtc.expiration_date,
        balance: rfidEtc.balance,
        is_active: rfidEtc.is_active,
        createdAt: rfidEtc.createdAt,
        updatedAt: rfidEtc.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching RFID/ETC by code:', error);
    internalError(res, 'Không thể lấy thông tin RFID/ETC');
  }
});

// POST /rfid-etc - Create a new RFID/ETC
rfidEtcRouter.post('/', async (req: IRfidEtcRequest, res: express.Response): Promise<void> => {
  try {
    const { rfid_etc, expiration_date, balance, is_active } = req.body;

    // Validate required fields
    if (!rfid_etc || !expiration_date) {
      res.status(400).json({
        success: false,
        error: 'Thiếu các trường bắt buộc: rfid_etc và expiration_date là bắt buộc'
      });
      return;
    }

    // Validate balance if provided
    if (balance !== undefined) {
      const balanceNum = Number(balance);
      if (isNaN(balanceNum) || balanceNum < 0) {
        res.status(400).json({
          success: false,
          error: 'balance phải là số >= 0'
        });
        return;
      }
    }

    // Validate expiration_date format
    const expirationDate = new Date(expiration_date);
    if (isNaN(expirationDate.getTime())) {
      res.status(400).json({
        success: false,
        error: 'Định dạng expiration_date không hợp lệ. Vui lòng sử dụng định dạng ISO (YYYY-MM-DD)'
      });
      return;
    }

    // Check if RFID/ETC already exists
    const existingRfidEtc = await RfidEtc.findOne({ 
      rfid_etc: rfid_etc.trim() 
    });
    
    if (existingRfidEtc) {
      res.status(409).json({
        success: false,
        error: 'RFID/ETC với mã này đã tồn tại'
      });
      return;
    }

    // Create RFID/ETC data object
    const rfidEtcData: any = {
      rfid_etc: rfid_etc.trim(),
      expiration_date: expirationDate
    };

    // Add balance if provided
    if (balance !== undefined) {
      rfidEtcData.balance = Number(balance);
    }

    // Add is_active if provided
    if (is_active !== undefined) {
      rfidEtcData.is_active = Boolean(is_active);
    }

    // Create the RFID/ETC
    const rfidEtc = await RfidEtc.create(rfidEtcData);

    res.status(201).json({
      success: true,
      message: 'Tạo RFID/ETC thành công',
      data: {
        _id: rfidEtc._id,
        rfid_etc: rfidEtc.rfid_etc,
        expiration_date: rfidEtc.expiration_date,
        balance: rfidEtc.balance,
        is_active: rfidEtc.is_active,
        createdAt: rfidEtc.createdAt,
        updatedAt: rfidEtc.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error creating RFID/ETC:', error);

    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        error: 'RFID/ETC với mã này đã tồn tại'
      });
      return;
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({
        success: false,
        error: 'Lỗi xác thực dữ liệu',
        details: errors
      });
      return;
    }

    internalError(res, 'Không thể tạo RFID/ETC');
  }
});

// PUT /rfid-etc/:rfid_etc - Update RFID/ETC by rfid_etc code
rfidEtcRouter.put('/:rfid_etc', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { rfid_etc } = req.params;
    const { expiration_date, balance, is_active } = req.body;

    // Validate rfid_etc parameter
    if (!rfid_etc || rfid_etc.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Mã RFID/ETC là bắt buộc'
      });
      return;
    }

    // Find the RFID/ETC first
    const existingRfidEtc = await RfidEtc.findOne({ 
      rfid_etc: rfid_etc.trim() 
    });

    if (!existingRfidEtc) {
      res.status(404).json({
        success: false,
        error: 'Không tìm thấy RFID/ETC'
      });
      return;
    }

    // Validate balance if provided
    if (balance !== undefined) {
      const balanceNum = Number(balance);
      if (isNaN(balanceNum) || balanceNum < 0) {
        res.status(400).json({
          success: false,
          error: 'balance phải là số >= 0'
        });
        return;
      }
    }

    // Validate expiration_date if provided
    let expirationDate = null;
    if (expiration_date) {
      expirationDate = new Date(expiration_date);
      if (isNaN(expirationDate.getTime())) {
        res.status(400).json({
          success: false,
          error: 'Định dạng expiration_date không hợp lệ. Vui lòng sử dụng định dạng ISO (YYYY-MM-DD)'
        });
        return;
      }
    }

    // Prepare update data (only include provided fields)
    const updateData: any = {};
    if (expiration_date !== undefined) updateData.expiration_date = expirationDate;
    if (balance !== undefined) updateData.balance = Number(balance);
    if (is_active !== undefined) updateData.is_active = Boolean(is_active);

    // Update the RFID/ETC
    const updatedRfidEtc = await RfidEtc.findByIdAndUpdate(
      existingRfidEtc._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Cập nhật RFID/ETC thành công',
      data: {
        _id: updatedRfidEtc?._id,
        rfid_etc: updatedRfidEtc?.rfid_etc,
        expiration_date: updatedRfidEtc?.expiration_date,
        balance: updatedRfidEtc?.balance,
        is_active: updatedRfidEtc?.is_active,
        createdAt: updatedRfidEtc?.createdAt,
        updatedAt: updatedRfidEtc?.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error updating RFID/ETC:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({
        success: false,
        error: 'Lỗi xác thực dữ liệu',
        details: errors
      });
      return;
    }

    internalError(res, 'Không thể cập nhật RFID/ETC');
  }
});

// DELETE /rfid-etc/:rfid_etc - Soft delete RFID/ETC by rfid_etc code (set is_active = false)
rfidEtcRouter.delete('/:rfid_etc', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { rfid_etc } = req.params;

    // Validate rfid_etc parameter
    if (!rfid_etc || rfid_etc.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Mã RFID/ETC là bắt buộc'
      });
      return;
    }

    // Find the RFID/ETC first (including inactive ones for soft delete)
    const existingRfidEtc = await RfidEtc.findOne({ 
      rfid_etc: rfid_etc.trim() 
    });

    if (!existingRfidEtc) {
      res.status(404).json({
        success: false,
        error: 'Không tìm thấy RFID/ETC'
      });
      return;
    }

    // Check if RFID/ETC is already inactive
    if (!existingRfidEtc.is_active) {
      res.status(400).json({
        success: false,
        error: 'RFID/ETC đã bị xóa trước đó'
      });
      return;
    }

    // Check if RFID/ETC is assigned to any active vehicle
    const vehicleWithRfid = await Vehicle.findOne({ 
      rfid_etc: rfid_etc.trim(),
      is_active: true
    });

    if (vehicleWithRfid) {
      res.status(409).json({
        success: false,
        error: 'Không thể xóa RFID/ETC vì đang được gán cho phương tiện. Vui lòng gỡ khỏi phương tiện trước'
      });
      return;
    }

    // Soft delete: set is_active = false
    const updatedRfidEtc = await RfidEtc.findByIdAndUpdate(
      existingRfidEtc._id,
      { is_active: false },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Xóa RFID/ETC thành công',
      data: {
        _id: updatedRfidEtc?._id,
        rfid_etc: updatedRfidEtc?.rfid_etc,
        expiration_date: updatedRfidEtc?.expiration_date,
        balance: updatedRfidEtc?.balance,
        is_active: updatedRfidEtc?.is_active,
        createdAt: updatedRfidEtc?.createdAt,
        updatedAt: updatedRfidEtc?.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error deleting RFID/ETC:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({
        success: false,
        error: 'Lỗi xác thực dữ liệu',
        details: errors
      });
      return;
    }

    internalError(res, 'Không thể xóa RFID/ETC');
  }
});

export default rfidEtcRouter;

