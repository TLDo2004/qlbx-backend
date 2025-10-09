import express from 'express';
import cameraRouter from './camera';

const gateStaffRouter = express.Router();

// Use camera routes
gateStaffRouter.use('/camera', cameraRouter);

export default gateStaffRouter;