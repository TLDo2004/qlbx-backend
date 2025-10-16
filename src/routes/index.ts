import express from 'express';
import employeeRouter from './employee';
import { auth, employeeAuth, gateStaffAuth } from '../middleware/index';
import gateStaffRouter from './gateStaff';
import vehicleRouter from './vehicle';
import rfidEtcRouter from './rfidEtc';
import bufferRouter from './buffer';
import eventRouter from './event';
import eventMergerRouter from './eventMerger';


const router = express.Router();

// Mount the route groups with authentication
router.use('/employee', auth, employeeAuth, employeeRouter);
router.use('/gate-staff', auth, gateStaffAuth, gateStaffRouter);
router.use('/vehicle', auth, vehicleRouter);
router.use('/rfid-etc', auth, rfidEtcRouter);
router.use('/buffer', auth, gateStaffAuth, bufferRouter);
router.use('/event', auth, gateStaffAuth, eventRouter);
router.use('/event-merger', auth, gateStaffAuth, eventMergerRouter);

export default router;