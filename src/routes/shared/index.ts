import express from 'express';
import feeRuleRouter from './feeRule';
import eventRouter from './event';
import rfidEtcRouter from './rfidEtc';
import transactionRouter from './transaction';
import vehicleRouter from './vehicle';
import feeRecordRouter from './feeRecord';
import { gateStaffAuth } from '../../middleware';

const sharedRouter = express.Router();

// Mount fee rule routes
sharedRouter.use('/fee-rule', feeRuleRouter);
// Mount event routes (requires gateStaffAuth)
sharedRouter.use('/event', gateStaffAuth, eventRouter);
// Mount rfid-etc routes
sharedRouter.use('/rfid-etc', rfidEtcRouter);
// Mount transaction routes
sharedRouter.use('/transaction', transactionRouter);
// Mount vehicle routes
sharedRouter.use('/vehicle', vehicleRouter);
// Mount fee record routes
sharedRouter.use('/fee-record', feeRecordRouter);

export default sharedRouter;

