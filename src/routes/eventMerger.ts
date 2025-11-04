/**
 * Event Merger API Routes
 * Quản lý Event Merger Service
 */

import express from 'express';
import EventMergerService from '../services/_eventMergerService';
import { gateStaffAuth } from '../middleware';
import { internalError, badRequest, success } from '../utils';

const eventMergerRouter = express.Router();

// GET /event-merger/status - Get merger service status
eventMergerRouter.get('/status', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const eventMergerService = EventMergerService.getInstance();
    const status = eventMergerService.getStatus();
    
    success(res, status, 'Event Merger Service status retrieved successfully');
  } catch (error: any) {
    console.error('Error getting merger status:', error);
    internalError(res, 'Failed to get merger status');
  }
});

// POST /event-merger/start - Start the merger service
eventMergerRouter.post('/start', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const eventMergerService = EventMergerService.getInstance();
    eventMergerService.start();
    
    const status = eventMergerService.getStatus();
    success(res, status, 'Event Merger Service started successfully');
  } catch (error: any) {
    console.error('Error starting merger service:', error);
    internalError(res, 'Failed to start merger service');
  }
});

// POST /event-merger/stop - Stop the merger service
eventMergerRouter.post('/stop', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const eventMergerService = EventMergerService.getInstance();
    eventMergerService.stop();
    
    const status = eventMergerService.getStatus();
    success(res, status, 'Event Merger Service stopped successfully');
  } catch (error: any) {
    console.error('Error stopping merger service:', error);
    internalError(res, 'Failed to stop merger service');
  }
});

// POST /event-merger/config - Update merger configuration
eventMergerRouter.post('/config', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { mergeInterval, deltaTimeThreshold, maxRetries, retryDelay } = req.body;

    // Validate configuration
    const config: any = {};
    
    if (mergeInterval !== undefined) {
      if (typeof mergeInterval !== 'number' || mergeInterval < 1000) {
        badRequest(res, 'mergeInterval must be a number >= 1000 (1 second)');
        return;
      }
      config.mergeInterval = mergeInterval;
    }

    if (deltaTimeThreshold !== undefined) {
      if (typeof deltaTimeThreshold !== 'number' || deltaTimeThreshold < 0) {
        badRequest(res, 'deltaTimeThreshold must be a number >= 0');
        return;
      }
      config.deltaTimeThreshold = deltaTimeThreshold;
    }

    if (maxRetries !== undefined) {
      if (typeof maxRetries !== 'number' || maxRetries < 0) {
        badRequest(res, 'maxRetries must be a number >= 0');
        return;
      }
      config.maxRetries = maxRetries;
    }

    if (retryDelay !== undefined) {
      if (typeof retryDelay !== 'number' || retryDelay < 0) {
        badRequest(res, 'retryDelay must be a number >= 0');
        return;
      }
      config.retryDelay = retryDelay;
    }

    const eventMergerService = EventMergerService.getInstance();
    eventMergerService.updateConfig(config);
    
    const status = eventMergerService.getStatus();
    success(res, status, 'Event Merger Service configuration updated successfully');
  } catch (error: any) {
    console.error('Error updating merger config:', error);
    internalError(res, 'Failed to update merger configuration');
  }
});

// POST /event-merger/merge - Manual merge operation
eventMergerRouter.post('/merge', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const eventMergerService = EventMergerService.getInstance();
    const result = await eventMergerService.manualMerge();
    
    success(res, result, 'Manual merge operation completed successfully');
  } catch (error: any) {
    console.error('Error during manual merge:', error);
    internalError(res, 'Failed to perform manual merge');
  }
});

export default eventMergerRouter;
