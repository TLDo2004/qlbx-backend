import express from 'express';
import { Vehicle, VehicleStatus, VehicleType } from '../models';
import { internalError } from '../utils';

interface IVehicleRequest extends express.Request {
  body: {
    license_plate: string;
    vehicle_group?: string;
    vehicle_type?: string;
    company?: string;
    rfid_etc?: string;
    status: VehicleStatus;
  };
}

const vehicleRouter = express.Router();

// GET /vehicle - Get all vehicles with pagination
vehicleRouter.get('/', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // Validate pagination parameters
    if (page < 1) {
      res.status(400).json({
        success: false,
        error: 'Page number must be greater than 0'
      });
      return;
    }

    if (limit < 1 || limit > 100) {
      res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 100'
      });
      return;
    }

    // Calculate skip value
    const skip = (page - 1) * limit;

    // Get total count for pagination info
    const totalVehicles = await Vehicle.countDocuments();
    const totalPages = Math.ceil(totalVehicles / limit);

    // Get vehicles with pagination
    const vehicles = await Vehicle.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      data: vehicles,
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
    internalError(res, 'Failed to fetch vehicles');
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
        error: 'License plate is required'
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
        error: 'Vehicle not found'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        _id: vehicle._id,
        license_plate: vehicle.license_plate,
        vehicle_group: vehicle.vehicle_group,
        vehicle_type: vehicle.vehicle_type,
        company: vehicle.company,
        rfid_etc: vehicle.rfid_etc,
        status: vehicle.status,
        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching vehicle by license plate:', error);
    internalError(res, 'Failed to fetch vehicle');
  }
});

// POST /vehicle - Create a new vehicle
vehicleRouter.post('/', async (req: IVehicleRequest, res: express.Response): Promise<void> => {
  try {
    const { license_plate, vehicle_group, vehicle_type, company, rfid_etc, status } = req.body;

    // Validate required fields
    if (!license_plate || !status) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: license_plate and status are required'
      });
      return;
    }

    // Validate status enum
    if (!Object.values(VehicleStatus).includes(status)) {
      res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${Object.values(VehicleStatus).join(', ')}`
      });
      return;
    }

    // Validate vehicle_type if provided
    if (vehicle_type && !Object.values(VehicleType).includes(vehicle_type as VehicleType)) {
      res.status(400).json({
        success: false,
        error: `Invalid vehicle_type. Must be one of: ${Object.values(VehicleType).join(', ')}`
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
        error: 'Vehicle with this license plate already exists'
      });
      return;
    }

    // Check if vehicle with same rfid_etc already exists (if provided)
    if (rfid_etc) {
      const existingRfidVehicle = await Vehicle.findOne({ 
        rfid_etc: rfid_etc.trim() 
      });
      
      if (existingRfidVehicle) {
        res.status(409).json({
          success: false,
          error: 'Vehicle with this RFID/ETC already exists'
        });
        return;
      }
    }

    // Create vehicle data object with only provided fields
    const vehicleData: any = {
      license_plate: license_plate.trim().toUpperCase(),
      status
    };

    // Add optional fields if provided
    if (vehicle_group) vehicleData.vehicle_group = vehicle_group.trim();
    if (vehicle_type) vehicleData.vehicle_type = vehicle_type;
    if (company) vehicleData.company = company.trim();
    if (rfid_etc) vehicleData.rfid_etc = rfid_etc.trim();

    // Create the vehicle
    const vehicle = await Vehicle.create(vehicleData);

    res.status(201).json({
      success: true,
      message: 'Vehicle created successfully',
      data: {
        _id: vehicle._id,
        license_plate: vehicle.license_plate,
        vehicle_group: vehicle.vehicle_group,
        vehicle_type: vehicle.vehicle_type,
        company: vehicle.company,
        rfid_etc: vehicle.rfid_etc,
        status: vehicle.status,
        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error creating vehicle:', error);

    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = error.keyPattern?.license_plate ? 'license_plate' : 'rfid_etc';
      res.status(409).json({
        success: false,
        error: `Vehicle with this ${field} already exists`
      });
      return;
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors
      });
      return;
    }

    internalError(res, 'Failed to create vehicle');
  }
});

// PUT /vehicle/:license_plate - Update vehicle by license plate
vehicleRouter.put('/:license_plate', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { license_plate } = req.params;
    const { vehicle_group, vehicle_type, company, rfid_etc, status } = req.body;

    // Validate license_plate parameter
    if (!license_plate || license_plate.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'License plate is required'
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
        error: 'Vehicle not found'
      });
      return;
    }

    // Validate status if provided
    if (status && !Object.values(VehicleStatus).includes(status)) {
      res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${Object.values(VehicleStatus).join(', ')}`
      });
      return;
    }

    // Validate vehicle_type if provided
    if (vehicle_type && !Object.values(VehicleType).includes(vehicle_type as VehicleType)) {
      res.status(400).json({
        success: false,
        error: `Invalid vehicle_type. Must be one of: ${Object.values(VehicleType).join(', ')}`
      });
      return;
    }

    // Check if rfid_etc is being updated and if it already exists for another vehicle
    if (rfid_etc && rfid_etc !== existingVehicle.rfid_etc) {
      const existingRfidVehicle = await Vehicle.findOne({ 
        rfid_etc: rfid_etc.trim(),
        _id: { $ne: existingVehicle._id } // Exclude current vehicle
      });
      
      if (existingRfidVehicle) {
        res.status(409).json({
          success: false,
          error: 'Vehicle with this RFID/ETC already exists'
        });
        return;
      }
    }

    // Prepare update data (only include provided fields)
    const updateData: any = {};
    if (vehicle_group !== undefined) updateData.vehicle_group = vehicle_group.trim();
    if (vehicle_type !== undefined) updateData.vehicle_type = vehicle_type;
    if (company !== undefined) updateData.company = company.trim();
    if (rfid_etc !== undefined) updateData.rfid_etc = rfid_etc.trim();
    if (status !== undefined) updateData.status = status;

    // Update the vehicle
    const updatedVehicle = await Vehicle.findByIdAndUpdate(
      existingVehicle._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Vehicle updated successfully',
      data: {
        _id: updatedVehicle?._id,
        license_plate: updatedVehicle?.license_plate,
        vehicle_group: updatedVehicle?.vehicle_group,
        vehicle_type: updatedVehicle?.vehicle_type,
        company: updatedVehicle?.company,
        rfid_etc: updatedVehicle?.rfid_etc,
        status: updatedVehicle?.status,
        createdAt: updatedVehicle?.createdAt,
        updatedAt: updatedVehicle?.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error updating vehicle:', error);

    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = error.keyPattern?.rfid_etc ? 'rfid_etc' : 'license_plate';
      res.status(409).json({
        success: false,
        error: `Vehicle with this ${field} already exists`
      });
      return;
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors
      });
      return;
    }

    internalError(res, 'Failed to update vehicle');
  }
});

export default vehicleRouter;