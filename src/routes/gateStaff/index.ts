import express from 'express';
import cameraRouter from './camera';
import anprRouter from './anpr';
import rfidRouter from './rfidReader';

const gateStaffRouter = express.Router();

// Use camera routes
gateStaffRouter.use('/camera', cameraRouter);

// Use ANPR routes
gateStaffRouter.use('/anpr', anprRouter);

// Use RFID reader routes
gateStaffRouter.use('/rfid', rfidRouter);

export default gateStaffRouter;