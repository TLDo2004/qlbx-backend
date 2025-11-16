import express from 'express';
import { gateStaffAuth } from '../../middleware';
import { badRequest, internalError, success } from '../../utils';
import VideoStreamService from '../../services/_videoStreamService';
import * as path from 'path';
import * as fs from 'fs';

const videoStreamRouter = express.Router();

interface IVideoStreamRequest extends express.Request {
  body: {
    rtspUrl: string;
  };
}

// POST /video-stream/start - Start RTSP to HLS conversion
videoStreamRouter.post('/start', gateStaffAuth, async (req: IVideoStreamRequest, res: express.Response): Promise<void> => {
  try {
    const { rtspUrl } = req.body;

    // Validate RTSP URL
    if (!rtspUrl || typeof rtspUrl !== 'string') {
      badRequest(res, 'Thiếu hoặc trường rtspUrl không hợp lệ');
      return;
    }

    // Validate RTSP URL format
    if (!rtspUrl.startsWith('rtsp://')) {
      badRequest(res, 'Định dạng RTSP URL không hợp lệ. Phải bắt đầu với rtsp://');
      return;
    }

    // Check if FFmpeg is available
    const ffmpegAvailable = await VideoStreamService.checkFFmpegAvailable();
    if (!ffmpegAvailable) {
      internalError(res, 'FFmpeg không được cài đặt hoặc không khả dụng. Vui lòng cài đặt FFmpeg.');
      return;
    }

    // Get service instance and start stream
    const videoStreamService = VideoStreamService.getInstance();
    console.log('📹 Starting video stream with RTSP URL:', rtspUrl);
    const result = await videoStreamService.startStream(rtspUrl);

    if (result.success) {
      console.log('✅ Video stream started successfully');
      success(res, {
        hlsUrl: result.hlsUrl,
        message: 'Video stream đã được khởi động thành công'
      }, 'Stream started successfully');
    } else {
      console.error('❌ Video stream failed to start:', result.error);
      // Return more detailed error message
      res.status(500).json({
        success: false,
        message: result.error || 'Không thể khởi động video stream',
        error: 'INTERNAL_ERROR',
        details: result.error
      });
    }
  } catch (error: any) {
    console.error('Error starting video stream:', error);
    internalError(res, 'Lỗi máy chủ khi khởi động video stream');
  }
});

// POST /video-stream/stop - Stop RTSP to HLS conversion
videoStreamRouter.post('/stop', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const videoStreamService = VideoStreamService.getInstance();
    videoStreamService.stopStream();

    success(res, {
      message: 'Video stream đã được dừng'
    }, 'Stream stopped successfully');
  } catch (error: any) {
    console.error('Error stopping video stream:', error);
    internalError(res, 'Lỗi máy chủ khi dừng video stream');
  }
});

// GET /video-stream/status - Get stream status
videoStreamRouter.get('/status', gateStaffAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const videoStreamService = VideoStreamService.getInstance();
    const status = videoStreamService.getStatus();

    success(res, {
      status: status.isRunning ? 'running' : 'stopped',
      rtspUrl: status.rtspUrl,
      playlistExists: status.playlistExists
    });
  } catch (error: any) {
    console.error('Error getting video stream status:', error);
    internalError(res, 'Lỗi máy chủ khi lấy trạng thái video stream');
  }
});

// GET /video-stream/hls/:filename - Serve HLS files (playlist and segments)
videoStreamRouter.get('/hls/:filename', gateStaffAuth, (req: express.Request, res: express.Response): void => {
  try {
    const { filename } = req.params;
    const hlsDir = path.join(process.cwd(), 'hls');
    const filePath = path.join(hlsDir, filename);

    // Security: Only allow .m3u8 and .ts files
    if (!filename.endsWith('.m3u8') && !filename.endsWith('.ts')) {
      badRequest(res, 'Invalid file type');
      return;
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        success: false,
        error: 'File not found'
      });
      return;
    }

    // Set appropriate headers
    if (filename.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
    } else if (filename.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }

    // Send file
    res.sendFile(filePath);
  } catch (error: any) {
    console.error('Error serving HLS file:', error);
    internalError(res, 'Lỗi khi phục vụ file HLS');
  }
});

export default videoStreamRouter;

