import express from 'express';
import cameraRouter from './camera';
import anprRouter from './anpr';

const gateStaffRouter = express.Router();

// Use camera routes
gateStaffRouter.use('/camera', cameraRouter);

// Use ANPR routes
gateStaffRouter.use('/anpr', anprRouter);

export default gateStaffRouter;