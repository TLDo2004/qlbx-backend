/**
 * Event Management API Routes
 * For managing merged events and event history
 */

import express from 'express';
import { Event, EventType, EventStatus } from '../models';
import { gateStaffAuth } from '../middleware';
import { internalError, badRequest, success, notFound, created } from '../utils';

const eventRouter = express.Router();

// Interface for Event request
interface IEventRequest extends express.Request {
  body: {
    eventType: EventType;
    license_plate: string;
    gateId: string;
    rfidEvent?: {
      rfid_etc: string;
      timestamp: Date;
      gateId: string;
    };
    cameraEvent?: {
      license_plate: string;
      timestamp: Date;
      gateId: string;
      imageData?: string;
    };
  };
}

// GET /event - Get all events with pagination and filters
eventRouter.get('/', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Parse query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const eventType = req.query.eventType as string;
    const status = req.query.status as string;
    const gateId = req.query.gateId as string;
    const licensePlate = req.query.licensePlate as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Validate pagination parameters
    if (page < 1) {
      badRequest(res, 'Page number must be greater than 0');
      return;
    }

    if (limit < 1 || limit > 100) {
      badRequest(res, 'Limit must be between 1 and 100');
      return;
    }

    // Calculate skip value
    const skip = (page - 1) * limit;

    // Build filter object
    const filter: any = {};
    
    if (eventType && Object.values(EventType).includes(eventType as EventType)) {
      filter.eventType = eventType;
    }
    
    if (status && Object.values(EventStatus).includes(status as EventStatus)) {
      filter.status = status;
    }
    
    if (gateId) {
      filter.gateId = gateId;
    }
    
    if (licensePlate) {
      filter.license_plate = licensePlate.toUpperCase();
    }
    
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.timestamp.$lte = new Date(endDate);
      }
    }

    // Get total count for pagination info
    const totalEvents = await Event.countDocuments(filter);
    const totalPages = Math.ceil(totalEvents / limit);

    // Get events with pagination
    const events = await Event.find(filter)
      .populate('vehicle_id', 'license_plate vehicle_type company rfid_etc gate')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    success(res, {
      events,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalEvents,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    }, 'Events retrieved successfully');
  } catch (error: any) {
    console.error('Error fetching events:', error);
    internalError(res, 'Failed to fetch events');
  }
});

// GET /event/:id - Get event by ID
eventRouter.get('/:id', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      badRequest(res, 'Event ID is required');
      return;
    }

    const event = await Event.findById(id)
      .populate('vehicle_id', 'license_plate vehicle_type company rfid_etc gate');

    if (!event) {
      notFound(res, 'Event not found');
      return;
    }

    success(res, event, 'Event retrieved successfully');
  } catch (error: any) {
    console.error('Error fetching event:', error);
    internalError(res, 'Failed to fetch event');
  }
});

// POST /event - Create a new event
eventRouter.post('/', gateStaffAuth, async (req: IEventRequest, res: express.Response): Promise<void> => {
  try {
    const { eventType, license_plate, gateId, rfidEvent, cameraEvent } = req.body;

    // Validate required fields
    if (!eventType || !license_plate || !gateId) {
      badRequest(res, 'Missing required fields: eventType, license_plate, and gateId are required');
      return;
    }

    // Validate eventType enum
    if (!Object.values(EventType).includes(eventType)) {
      badRequest(res, `Invalid eventType. Must be one of: ${Object.values(EventType).join(', ')}`);
      return;
    }

    // Validate that at least one event data is provided
    if (!rfidEvent && !cameraEvent) {
      badRequest(res, 'At least one of rfidEvent or cameraEvent must be provided');
      return;
    }


    // Create event data object
    const eventData: any = {
      eventType,
      license_plate: license_plate.toUpperCase(),
      gateId,
      timestamp: new Date()
    };

    // Add optional fields
    if (rfidEvent) eventData.rfidEvent = rfidEvent;
    if (cameraEvent) eventData.cameraEvent = cameraEvent;

    // Create the event
    const event = await Event.create(eventData);

    // Populate vehicle info
    await event.populate('vehicle_id', 'license_plate vehicle_type company rfid_etc gate');

    created(res, event, 'Event created successfully');
  } catch (error: any) {
    console.error('Error creating event:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      badRequest(res, 'Validation error');
      return;
    }

    internalError(res, 'Failed to create event');
  }
});

// PUT /event/:id/status - Update event status
eventRouter.put('/:id/status', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, failureReason } = req.body;

    if (!id) {
      badRequest(res, 'Event ID is required');
      return;
    }

    if (!status) {
      badRequest(res, 'Status is required');
      return;
    }

    // Validate status enum
    if (!Object.values(EventStatus).includes(status)) {
      badRequest(res, `Invalid status. Must be one of: ${Object.values(EventStatus).join(', ')}`);
      return;
    }

    // Find the event
    const event = await Event.findById(id);
    if (!event) {
      notFound(res, 'Event not found');
      return;
    }

    // Prepare update data
    const updateData: any = {
      status,
      updatedAt: new Date()
    };

    if (status === EventStatus.FAILED && failureReason) {
      updateData.failureReason = failureReason;
    }

    // Update the event
    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('vehicle_id', 'license_plate vehicle_type company rfid_etc gate');

    success(res, updatedEvent, 'Event status updated successfully');
  } catch (error: any) {
    console.error('Error updating event status:', error);
    internalError(res, 'Failed to update event status');
  }
});

// GET /event/stats/summary - Get event statistics
eventRouter.get('/stats/summary', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Build date filter
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.timestamp = {};
      if (startDate) dateFilter.timestamp.$gte = new Date(startDate);
      if (endDate) dateFilter.timestamp.$lte = new Date(endDate);
    }

    // Get statistics
    const [
      totalEvents,
      mergedEvents,
      rfidOnlyEvents,
      cameraOnlyEvents,
      pendingEvents,
      processedEvents,
      failedEvents
    ] = await Promise.all([
      Event.countDocuments(dateFilter),
      Event.countDocuments({ ...dateFilter, eventType: EventType.MERGED }),
      Event.countDocuments({ ...dateFilter, eventType: EventType.RFID_ONLY }),
      Event.countDocuments({ ...dateFilter, eventType: EventType.CAMERA_ONLY }),
      Event.countDocuments({ ...dateFilter, status: EventStatus.PENDING }),
      Event.countDocuments({ ...dateFilter, status: EventStatus.PROCESSED }),
      Event.countDocuments({ ...dateFilter, status: EventStatus.FAILED })
    ]);

    const stats = {
      totalEvents,
      eventTypes: {
        merged: mergedEvents,
        rfidOnly: rfidOnlyEvents,
        cameraOnly: cameraOnlyEvents
      },
      status: {
        pending: pendingEvents,
        processed: processedEvents,
        failed: failedEvents
      },
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null
      }
    };

    success(res, stats, 'Event statistics retrieved successfully');
  } catch (error: any) {
    console.error('Error fetching event statistics:', error);
    internalError(res, 'Failed to fetch event statistics');
  }
});

export default eventRouter;
