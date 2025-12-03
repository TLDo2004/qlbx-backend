import express from 'express';
import employeeRouter from './employee';
import { auth, employeeAuth, gateStaffAuth } from '../middleware/index';
import gateStaffRouter from './gateStaff';
import sharedRouter from './shared';


const router = express.Router();

// Mount the route groups with authentication
router.use('/employee', auth, employeeAuth, employeeRouter);
router.use('/gate-staff', auth, gateStaffAuth, gateStaffRouter);
router.use('/shared', auth, sharedRouter);

export default router;