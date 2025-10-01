import express from 'express';
import employeeRouter from './employee';
import { auth } from '../middleware/index';


const router = express.Router();

// Mount the route groups with authentication
router.use('/employee', auth, employeeRouter);

export default router;      