import express from 'express';
import employeeRouter from './employee';
import { auth, employeeAuth, gateStaffAuth } from '../middleware/index';
import gateStaffRouter from './gateStaff';
import vehicleRouter from './vehicle';
import rfidEtcRouter from './rfidEtc';
import bufferRouter from './buffer';
import eventRouter from './event';
import eventMergerRouter from './eventMerger';
import feeRouter from './fee';
import feeRecordRouter from './feeRecord';
import accountRouter from './account';
import transactionRouter from './transaction';


const router = express.Router();

// Mount the route groups with authentication
router.use('/employee', auth, employeeAuth, employeeRouter);
router.use('/gate-staff', auth, gateStaffAuth, gateStaffRouter);
router.use('/vehicle', auth, vehicleRouter);
router.use('/rfid-etc', auth, rfidEtcRouter);
router.use('/buffer', auth, gateStaffAuth, bufferRouter);
router.use('/event', auth, gateStaffAuth, eventRouter);
router.use('/event-merger', auth, gateStaffAuth, eventMergerRouter);
router.use('/fee', auth, feeRouter);
router.use('/fee-record', auth, feeRecordRouter);
router.use('/account', auth, accountRouter);
router.use('/transaction', auth, transactionRouter);

export default router;