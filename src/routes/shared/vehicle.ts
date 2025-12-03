import express from 'express';
import mongoose from 'mongoose';
import { Vehicle, VehicleType, VehicleGateStatus, BusCompany } from '../../models';
import { internalError } from '../../utils';

interface IVehicleRequest extends express.Request {
  body: {
    license_plate: string;
    seat?: string;
    vehicle_type?: string;
    companyId?: string;
    routeId?: string;
    rfid_etc?: string;
    gate: VehicleGateStatus;
  };
}

const vehicleRouter = express.Router();
const isValidObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /vehicle - Get all vehicles with pagination
vehicleRouter.get('/', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const vehicleTypeFilter = typeof req.query.vehicle_type === 'string' ? req.query.vehicle_type : '';
    const gateFilter = typeof req.query.gate === 'string' ? req.query.gate : '';
    const companyIdFilter = typeof req.query.companyId === 'string' ? req.query.companyId.trim() : '';

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

    // Build filter conditions
    const filters: any = {};

    if (vehicleTypeFilter && vehicleTypeFilter !== 'all') {
      if (!Object.values(VehicleType).includes(vehicleTypeFilter as VehicleType)) {
        res.status(400).json({
          success: false,
          error: 'Loại phương tiện không hợp lệ'
        });
        return;
      }
      filters.vehicle_type = vehicleTypeFilter;
    }

    if (gateFilter && gateFilter !== 'all') {
      if (!Object.values(VehicleGateStatus).includes(gateFilter as VehicleGateStatus)) {
        res.status(400).json({
          success: false,
          error: 'Trạng thái cổng không hợp lệ'
        });
        return;
      }
      filters.gate = gateFilter;
    }

    if (companyIdFilter) {
      if (!isValidObjectId(companyIdFilter)) {
        res.status(400).json({
          success: false,
          error: 'companyId phải là ID hợp lệ của bus company'
        });
        return;
      }
      filters.companyId = new mongoose.Types.ObjectId(companyIdFilter);
    }

    const searchConditions: any[] = [];
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      searchConditions.push(
        { license_plate: regex },
        { seat: regex },
        { rfid_etc: regex }
      );

      const matchingCompanies = await BusCompany.find({ name: regex }).select('_id').lean();
      if (matchingCompanies.length > 0) {
        searchConditions.push({
          companyId: { $in: matchingCompanies.map(company => company._id) }
        });
      }
    }

    if (searchConditions.length > 0) {
      filters.$or = searchConditions;
    }

    // Calculate skip value
    const skip = (page - 1) * limit;

    // Get total count for pagination info
    const totalVehicles = await Vehicle.countDocuments(filters);
    const totalPages = Math.ceil(totalVehicles / limit);

    // Get vehicles with pagination
    const vehicles = await Vehicle.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'companyId',
        select: 'name'
      })
      .lean();

    const formattedVehicles = vehicles.map((vehicle: any) => {
      const hasCompanyDetails = vehicle.companyId && typeof vehicle.companyId === 'object' && 'name' in vehicle.companyId;
      const companyDoc = hasCompanyDetails ? vehicle.companyId : null;

      return {
        _id: vehicle._id,
        license_plate: vehicle.license_plate,
        seat: vehicle.seat,
        vehicle_type: vehicle.vehicle_type,
        company: companyDoc ? companyDoc.name : null,
        rfid_etc: vehicle.rfid_etc,
        gate: vehicle.gate,
        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt
      };
    });

    res.json({
      success: true,
      data: formattedVehicles,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalVehicles,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    internalError(res, 'Không thể lấy danh sách phương tiện');
  }
});

// GET /vehicle/:license_plate - Get vehicle by license plate
vehicleRouter.get('/:license_plate', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { license_plate } = req.params;

    // Validate license_plate parameter
    if (!license_plate || license_plate.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Biển số xe là bắt buộc'
      });
      return;
    }

    // Find vehicle by license plate (case-insensitive)
    const vehicle = await Vehicle.findOne({ 
      license_plate: license_plate.trim().toUpperCase() 
    });

    if (!vehicle) {
      res.status(404).json({
        success: false,
        error: 'Không tìm thấy phương tiện'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        _id: vehicle._id,
        license_plate: vehicle.license_plate,
        seat: vehicle.seat,
        vehicle_type: vehicle.vehicle_type,
        companyId: vehicle.companyId,
        routeId: vehicle.routeId,
        rfid_etc: vehicle.rfid_etc,
        gate: vehicle.gate,
        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching vehicle by license plate:', error);
    internalError(res, 'Không thể lấy thông tin phương tiện');
  }
});

// POST /vehicle - Create a new vehicle
vehicleRouter.post('/', async (req: IVehicleRequest, res: express.Response): Promise<void> => {
  try {
    const { license_plate, seat, vehicle_type, companyId, routeId, rfid_etc, gate } = req.body;

    // Validate required fields
    if (!license_plate || !gate) {
      res.status(400).json({
        success: false,
        error: 'Thiếu các trường bắt buộc: license_plate và gate là bắt buộc'
      });
      return;
    }

    // Validate gate enum
    if (!Object.values(VehicleGateStatus).includes(gate)) {
      res.status(400).json({
        success: false,
        error: `Cổng không hợp lệ. Phải là một trong: ${Object.values(VehicleGateStatus).join(', ')}`
      });
      return;
    }

    // Validate vehicle_type if provided
    if (vehicle_type && !Object.values(VehicleType).includes(vehicle_type as VehicleType)) {
      res.status(400).json({
        success: false,
        error: `Loại phương tiện không hợp lệ. Phải là một trong: ${Object.values(VehicleType).join(', ')}`
      });
      return;
    }

    // Check if vehicle with same license_plate already exists
    const existingVehicle = await Vehicle.findOne({ 
      license_plate: license_plate.trim().toUpperCase() 
    });
    
    if (existingVehicle) {
      res.status(409).json({
        success: false,
        error: 'Phương tiện với biển số này đã tồn tại'
      });
      return;
    }

    // Check if rfid_etc exists in rfid_etc collection and if it's already assigned (if provided)
    if (rfid_etc) {
      // First check if rfid_etc exists in rfid_etc collection
      const { RfidEtc } = await import('../../models');
      const existingRfidEtc = await RfidEtc.findOne({ 
        rfid_etc: rfid_etc.trim()
      });
      
      if (!existingRfidEtc) {
        res.status(400).json({
          success: false,
          error: 'Không tìm thấy RFID/ETC trong hệ thống. Vui lòng thêm vào bộ sưu tập rfid_etc trước'
        });
        return;
      }
      
      // Then check if it's already assigned to another vehicle
      const existingRfidVehicle = await Vehicle.findOne({ 
        rfid_etc: rfid_etc.trim() 
      });
      
      if (existingRfidVehicle) {
        res.status(409).json({
          success: false,
          error: 'Phương tiện với RFID/ETC này đã tồn tại'
        });
        return;
      }
    }

    // Create vehicle data object with only provided fields
    const vehicleData: any = {
      license_plate: license_plate.trim().toUpperCase(),
      gate
    };

    // Add optional fields if provided
    if (seat) vehicleData.seat = seat.trim();
    if (vehicle_type) vehicleData.vehicle_type = vehicle_type;
    if (companyId) {
      if (!isValidObjectId(companyId)) {
        res.status(400).json({
          success: false,
          error: 'companyId phải là ID hợp lệ của bus company'
        });
        return;
      }
      vehicleData.companyId = new mongoose.Types.ObjectId(companyId);
    }
    if (routeId) {
      if (!isValidObjectId(routeId)) {
        res.status(400).json({
          success: false,
          error: 'routeId phải là ID hợp lệ của route'
        });
        return;
      }
      vehicleData.routeId = new mongoose.Types.ObjectId(routeId);
    }
    if (rfid_etc) vehicleData.rfid_etc = rfid_etc.trim();

    // Create the vehicle
    const vehicle = await Vehicle.create(vehicleData);

    res.status(201).json({
      success: true,
      message: 'Tạo phương tiện thành công',
      data: {
        _id: vehicle._id,
        license_plate: vehicle.license_plate,
        seat: vehicle.seat,
        vehicle_type: vehicle.vehicle_type,
        companyId: vehicle.companyId ? vehicle.companyId.toString() : null,
        routeId: vehicle.routeId ? vehicle.routeId.toString() : null,
        rfid_etc: vehicle.rfid_etc,
        gate: vehicle.gate,
        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error creating vehicle:', error);

    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = error.keyPattern?.license_plate ? 'biển số' : 'RFID/ETC';
      res.status(409).json({
        success: false,
        error: `Phương tiện với ${field} này đã tồn tại`
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

    internalError(res, 'Không thể tạo phương tiện');
  }
});

// PUT /vehicle/:license_plate - Update vehicle by license plate
vehicleRouter.put('/:license_plate', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { license_plate } = req.params;
    const { seat, vehicle_type, companyId, routeId, rfid_etc, gate } = req.body;

    // Validate license_plate parameter
    if (!license_plate || license_plate.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Biển số xe là bắt buộc'
      });
      return;
    }

    // Find the vehicle first
    const existingVehicle = await Vehicle.findOne({ 
      license_plate: license_plate.trim().toUpperCase() 
    });

    if (!existingVehicle) {
      res.status(404).json({
        success: false,
        error: 'Không tìm thấy phương tiện'
      });
      return;
    }

    // Validate gate if provided
    if (gate && !Object.values(VehicleGateStatus).includes(gate)) {
      res.status(400).json({
        success: false,
        error: `Cổng không hợp lệ. Phải là một trong: ${Object.values(VehicleGateStatus).join(', ')}`
      });
      return;
    }

    // Validate vehicle_type if provided
    if (vehicle_type && !Object.values(VehicleType).includes(vehicle_type as VehicleType)) {
      res.status(400).json({
        success: false,
        error: `Loại phương tiện không hợp lệ. Phải là một trong: ${Object.values(VehicleType).join(', ')}`
      });
      return;
    }

    // Check if rfid_etc is being updated and if it exists in rfid_etc collection
    if (rfid_etc && rfid_etc !== existingVehicle.rfid_etc) {
      // First check if rfid_etc exists in rfid_etc collection
      const { RfidEtc } = await import('../../models');
      const existingRfidEtc = await RfidEtc.findOne({ 
        rfid_etc: rfid_etc.trim()
      });
      
      if (!existingRfidEtc) {
        res.status(400).json({
          success: false,
          error: 'Không tìm thấy RFID/ETC trong hệ thống. Vui lòng thêm vào bộ sưu tập rfid_etc trước'
        });
        return;
      }
      
      // Then check if it's already assigned to another vehicle
      const existingRfidVehicle = await Vehicle.findOne({ 
        rfid_etc: rfid_etc.trim(),
        _id: { $ne: existingVehicle._id } // Exclude current vehicle
      });
      
      if (existingRfidVehicle) {
        res.status(409).json({
          success: false,
          error: 'Phương tiện với RFID/ETC này đã tồn tại'
        });
        return;
      }
    }

    // Prepare update data (only include provided fields)
    const updateData: any = {};
    if (seat !== undefined) updateData.seat = seat.trim();
    if (vehicle_type !== undefined) updateData.vehicle_type = vehicle_type;
    if (companyId !== undefined) {
      if (companyId === null || companyId === '') {
        updateData.companyId = null;
      } else if (!isValidObjectId(companyId)) {
        res.status(400).json({
          success: false,
          error: 'companyId phải là ID hợp lệ của bus company'
        });
        return;
      } else {
        updateData.companyId = new mongoose.Types.ObjectId(companyId);
      }
    }
    if (routeId !== undefined) {
      if (routeId === null || routeId === '') {
        updateData.routeId = null;
      } else if (!isValidObjectId(routeId)) {
        res.status(400).json({
          success: false,
          error: 'routeId phải là ID hợp lệ của route'
        });
        return;
      } else {
        updateData.routeId = new mongoose.Types.ObjectId(routeId);
      }
    }
    if (rfid_etc !== undefined) updateData.rfid_etc = rfid_etc.trim();
    if (gate !== undefined) updateData.gate = gate;

    // Update the vehicle
    const updatedVehicle = await Vehicle.findByIdAndUpdate(
      existingVehicle._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Cập nhật phương tiện thành công',
      data: {
        _id: updatedVehicle?._id,
        license_plate: updatedVehicle?.license_plate,
        seat: updatedVehicle?.seat,
        vehicle_type: updatedVehicle?.vehicle_type,
        companyId: updatedVehicle?.companyId ? updatedVehicle.companyId.toString() : null,
        routeId: updatedVehicle?.routeId ? updatedVehicle.routeId.toString() : null,
        rfid_etc: updatedVehicle?.rfid_etc,
        gate: updatedVehicle?.gate,
        createdAt: updatedVehicle?.createdAt,
        updatedAt: updatedVehicle?.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error updating vehicle:', error);

    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = error.keyPattern?.rfid_etc ? 'RFID/ETC' : 'biển số';
      res.status(409).json({
        success: false,
        error: `Phương tiện với ${field} này đã tồn tại`
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

    internalError(res, 'Không thể cập nhật phương tiện');
  }
});

export default vehicleRouter;

