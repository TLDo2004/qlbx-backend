import express from 'express';
import { RfidEtc, RfidEtcStatus } from '../models';
import { internalError } from '../utils';

interface IRfidEtcRequest extends express.Request {
  body: {
    rfid_etc: string;
    expiration_date: string;
    status?: RfidEtcStatus;
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
    const totalRfidEtc = await RfidEtc.countDocuments();
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
    internalError(res, 'Failed to fetch RFID/ETC');
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
        error: 'RFID/ETC code is required'
      });
      return;
    }

    // Find RFID/ETC by code
    const rfidEtc = await RfidEtc.findOne({ 
      rfid_etc: rfid_etc.trim() 
    });

    if (!rfidEtc) {
      res.status(404).json({
        success: false,
        error: 'RFID/ETC not found'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        _id: rfidEtc._id,
        rfid_etc: rfidEtc.rfid_etc,
        expiration_date: rfidEtc.expiration_date,
        status: rfidEtc.status,
        createdAt: rfidEtc.createdAt,
        updatedAt: rfidEtc.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching RFID/ETC by code:', error);
    internalError(res, 'Failed to fetch RFID/ETC');
  }
});

// POST /rfid-etc - Create a new RFID/ETC
rfidEtcRouter.post('/', async (req: IRfidEtcRequest, res: express.Response): Promise<void> => {
  try {
    const { rfid_etc, expiration_date, status } = req.body;

    // Validate required fields
    if (!rfid_etc || !expiration_date) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: rfid_etc and expiration_date are required'
      });
      return;
    }

    // Validate status if provided
    if (status && !Object.values(RfidEtcStatus).includes(status)) {
      res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${Object.values(RfidEtcStatus).join(', ')}`
      });
      return;
    }

    // Validate expiration_date format
    const expirationDate = new Date(expiration_date);
    if (isNaN(expirationDate.getTime())) {
      res.status(400).json({
        success: false,
        error: 'Invalid expiration_date format. Please use ISO date format (YYYY-MM-DD)'
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
        error: 'RFID/ETC with this code already exists'
      });
      return;
    }

    // Create RFID/ETC data object
    const rfidEtcData: any = {
      rfid_etc: rfid_etc.trim(),
      expiration_date: expirationDate
    };

    // Add status if provided, otherwise use default
    if (status) {
      rfidEtcData.status = status;
    }

    // Create the RFID/ETC
    const rfidEtc = await RfidEtc.create(rfidEtcData);

    res.status(201).json({
      success: true,
      message: 'RFID/ETC created successfully',
      data: {
        _id: rfidEtc._id,
        rfid_etc: rfidEtc.rfid_etc,
        expiration_date: rfidEtc.expiration_date,
        status: rfidEtc.status,
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
        error: 'RFID/ETC with this code already exists'
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

    internalError(res, 'Failed to create RFID/ETC');
  }
});

// PUT /rfid-etc/:rfid_etc - Update RFID/ETC by rfid_etc code
rfidEtcRouter.put('/:rfid_etc', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { rfid_etc } = req.params;
    const { expiration_date, status } = req.body;

    // Validate rfid_etc parameter
    if (!rfid_etc || rfid_etc.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'RFID/ETC code is required'
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
        error: 'RFID/ETC not found'
      });
      return;
    }

    // Validate status if provided
    if (status && !Object.values(RfidEtcStatus).includes(status)) {
      res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${Object.values(RfidEtcStatus).join(', ')}`
      });
      return;
    }

    // Validate expiration_date if provided
    let expirationDate = null;
    if (expiration_date) {
      expirationDate = new Date(expiration_date);
      if (isNaN(expirationDate.getTime())) {
        res.status(400).json({
          success: false,
          error: 'Invalid expiration_date format. Please use ISO date format (YYYY-MM-DD)'
        });
        return;
      }
    }

    // Prepare update data (only include provided fields)
    const updateData: any = {};
    if (expiration_date !== undefined) updateData.expiration_date = expirationDate;
    if (status !== undefined) updateData.status = status;

    // Update the RFID/ETC
    const updatedRfidEtc = await RfidEtc.findByIdAndUpdate(
      existingRfidEtc._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'RFID/ETC updated successfully',
      data: {
        _id: updatedRfidEtc?._id,
        rfid_etc: updatedRfidEtc?.rfid_etc,
        expiration_date: updatedRfidEtc?.expiration_date,
        status: updatedRfidEtc?.status,
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
        error: 'Validation error',
        details: errors
      });
      return;
    }

    internalError(res, 'Failed to update RFID/ETC');
  }
});

export default rfidEtcRouter;
