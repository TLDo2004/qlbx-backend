import express from 'express';
import employeeRouter from './employee';
import { auth, employeeAuth, gateStaffAuth } from '../middleware/index';
import gateStaffRouter from './gateStaff';


const router = express.Router();

// Mount the route groups with authentication
router.use('/employee', auth, employeeAuth, employeeRouter);
router.use('/gate-staff', auth, gateStaffAuth, gateStaffRouter);

export default router;      