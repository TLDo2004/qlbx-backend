/**
 * Event Merger API Routes
 * Quản lý Event Merger Service
 */

import express from 'express';
import EventMergerService from '../../services/_eventMergerService';
import { gateStaffAuth } from '../../middleware';
import { internalError, badRequest, success } from '../../utils';

const eventMergerRouter = express.Router();

// GET /gate-staff/event-merger/status - Get merger service status
eventMergerRouter.get('/status', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const eventMergerService = EventMergerService.getInstance();
    const status = eventMergerService.getStatus();
    
    success(res, status, 'Lấy trạng thái dịch vụ gộp sự kiện thành công');
  } catch (error: any) {
    console.error('Error getting merger status:', error);
    internalError(res, 'Không thể lấy trạng thái dịch vụ gộp sự kiện');
  }
});

// POST /gate-staff/event-merger/start - Start the merger service
eventMergerRouter.post('/start', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const eventMergerService = EventMergerService.getInstance();
    eventMergerService.start();
    
    const status = eventMergerService.getStatus();
    success(res, status, 'Khởi động dịch vụ gộp sự kiện thành công');
  } catch (error: any) {
    console.error('Error starting merger service:', error);
    internalError(res, 'Không thể khởi động dịch vụ gộp sự kiện');
  }
});

// POST /gate-staff/event-merger/stop - Stop the merger service
eventMergerRouter.post('/stop', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const eventMergerService = EventMergerService.getInstance();
    eventMergerService.stop();
    
    const status = eventMergerService.getStatus();
    success(res, status, 'Dừng dịch vụ gộp sự kiện thành công');
  } catch (error: any) {
    console.error('Error stopping merger service:', error);
    internalError(res, 'Không thể dừng dịch vụ gộp sự kiện');
  }
});

// POST /gate-staff/event-merger/config - Update merger configuration
eventMergerRouter.post('/config', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { mergeInterval, deltaTimeThreshold, maxRetries, retryDelay } = req.body;

    // Validate configuration
    const config: any = {};
    
    if (mergeInterval !== undefined) {
      if (typeof mergeInterval !== 'number' || mergeInterval < 1000) {
        badRequest(res, 'mergeInterval phải là số >= 1000 (1 giây)');
        return;
      }
      config.mergeInterval = mergeInterval;
    }

    if (deltaTimeThreshold !== undefined) {
      if (typeof deltaTimeThreshold !== 'number' || deltaTimeThreshold < 0) {
        badRequest(res, 'deltaTimeThreshold phải là số >= 0');
        return;
      }
      config.deltaTimeThreshold = deltaTimeThreshold;
    }

    if (maxRetries !== undefined) {
      if (typeof maxRetries !== 'number' || maxRetries < 0) {
        badRequest(res, 'maxRetries phải là số >= 0');
        return;
      }
      config.maxRetries = maxRetries;
    }

    if (retryDelay !== undefined) {
      if (typeof retryDelay !== 'number' || retryDelay < 0) {
        badRequest(res, 'retryDelay phải là số >= 0');
        return;
      }
      config.retryDelay = retryDelay;
    }

    const eventMergerService = EventMergerService.getInstance();
    eventMergerService.updateConfig(config);
    
    const status = eventMergerService.getStatus();
    success(res, status, 'Cập nhật cấu hình dịch vụ gộp sự kiện thành công');
  } catch (error: any) {
    console.error('Error updating merger config:', error);
    internalError(res, 'Không thể cập nhật cấu hình dịch vụ gộp sự kiện');
  }
});

// POST /gate-staff/event-merger/merge - Manual merge operation
eventMergerRouter.post('/merge', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const eventMergerService = EventMergerService.getInstance();
    const result = await eventMergerService.manualMerge();
    
    success(res, result, 'Thực hiện gộp thủ công thành công');
  } catch (error: any) {
    console.error('Error during manual merge:', error);
    internalError(res, 'Không thể thực hiện gộp thủ công');
  }
});

export default eventMergerRouter;


