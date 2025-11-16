import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface VideoStreamConfig {
  rtspUrl: string;
  outputDir: string;
  playlistPath: string;
}

class VideoStreamService {
  private static instance: VideoStreamService;
  private ffmpegProcess: ChildProcess | null = null;
  private currentConfig: VideoStreamConfig | null = null;
  private isRunning: boolean = false;

  private constructor() {
    // Ensure hls directory exists
    const hlsDir = path.join(process.cwd(), 'hls');
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }
  }

  public static getInstance(): VideoStreamService {
    if (!VideoStreamService.instance) {
      VideoStreamService.instance = new VideoStreamService();
    }
    return VideoStreamService.instance;
  }

  /**
   * Start FFmpeg stream conversion from RTSP to HLS
   */
  public startStream(rtspUrl: string): Promise<{ success: boolean; hlsUrl?: string; error?: string }> {
    return new Promise((resolve) => {
      // Stop existing stream if any
      if (this.isRunning && this.ffmpegProcess) {
        this.stopStream();
      }

      const outputDir = path.join(process.cwd(), 'hls');
      const playlistPath = path.join(outputDir, 'stream.m3u8');

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Clean up old segments
      try {
        const files = fs.readdirSync(outputDir);
        files.forEach((file) => {
          if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
            fs.unlinkSync(path.join(outputDir, file));
          }
        });
      } catch (error) {
        console.error('Error cleaning up old segments:', error);
      }

      this.currentConfig = {
        rtspUrl,
        outputDir,
        playlistPath,
      };

      // FFmpeg command to convert RTSP → HLS
      const ffmpegArgs = [
        '-rtsp_transport', 'tcp',          // Use TCP for RTSP (more reliable)
        '-rtsp_flags', 'prefer_tcp',       // Prefer TCP for RTSP
        '-i', rtspUrl,                     // Input RTSP stream
        '-c:v', 'libx264',                 // Video codec H.264
        '-c:a', 'aac',                     // Audio codec AAC
        '-preset', 'ultrafast',            // Encoding speed
        '-tune', 'zerolatency',            // Low latency tuning
        '-f', 'hls',                       // Output format HLS
        '-hls_time', '2',                  // Segment duration 2 seconds
        '-hls_list_size', '10',             // Keep 10 segments in playlist (increased to reduce 404s)
        '-hls_flags', 'delete_segments',   // Delete old segments
        '-hls_allow_cache', '0',           // Disable cache
        '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
        '-reconnect', '1',                 // Reconnect on errors
        '-reconnect_at_eof', '1',         // Reconnect at end of file
        '-reconnect_streamed', '1',        // Reconnect for streamed content
        '-reconnect_delay_max', '2',       // Max delay between reconnects
        playlistPath
      ];

      console.log('🚀 Starting FFmpeg stream...');
      console.log('📹 RTSP URL:', rtspUrl);
      console.log('🔧 FFmpeg command:', 'ffmpeg', ffmpegArgs.join(' '));

      // Spawn FFmpeg process
      this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let hasResolved = false;
      let errorMessages: string[] = [];
      let lastErrorTime = Date.now();

      // Handle stdout
      this.ffmpegProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('📤 FFmpeg stdout:', output);
      });

      // Handle stderr (FFmpeg outputs info to stderr)
      this.ffmpegProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        console.log('📋 FFmpeg stderr:', output);

        // Check for errors in FFmpeg output
        if (output.toLowerCase().includes('error') || 
            output.toLowerCase().includes('failed') ||
            output.toLowerCase().includes('connection refused') ||
            output.toLowerCase().includes('unable to open') ||
            output.toLowerCase().includes('server returned 404') ||
            output.toLowerCase().includes('authentication failed')) {
          errorMessages.push(output.trim());
          lastErrorTime = Date.now();
          console.error('❌ FFmpeg error detected:', output);
        }

        // Check if stream has started successfully
        if (!hasResolved && (output.includes('Stream #') || output.includes('frame=') || output.includes('Opening'))) {
          // Poll for playlist file creation
          const checkPlaylist = setInterval(() => {
            if (fs.existsSync(playlistPath) && !hasResolved) {
              clearInterval(checkPlaylist);
              hasResolved = true;
              this.isRunning = true;
              const hlsUrl = `/api/v1/gate-staff/video-stream/hls/stream.m3u8`;
              console.log('✅ Stream started successfully, playlist created:', playlistPath);
              resolve({
                success: true,
                hlsUrl
              });
            }
          }, 500); // Check every 500ms

          // Stop checking after 5 seconds
          setTimeout(() => {
            clearInterval(checkPlaylist);
          }, 5000);
        }
      });

      // Handle process close
      this.ffmpegProcess.on('close', (code) => {
        console.log(`❌ FFmpeg process ended with code: ${code}`);
        this.isRunning = false;
        this.ffmpegProcess = null;

        if (!hasResolved) {
          hasResolved = true;
          const errorMsg = errorMessages.length > 0 
            ? errorMessages.join('; ') 
            : `FFmpeg process failed with code ${code}`;
          resolve({
            success: false,
            error: errorMsg
          });
        }
      });

      // Handle process error
      this.ffmpegProcess.on('error', (err) => {
        console.error('💥 FFmpeg error:', err);
        this.isRunning = false;
        this.ffmpegProcess = null;

        if (!hasResolved) {
          hasResolved = true;
          resolve({
            success: false,
            error: err.message || 'Failed to start FFmpeg process. Make sure FFmpeg is installed.'
          });
        }
      });

      // Poll for playlist file creation (alternative method)
      const playlistCheckInterval = setInterval(() => {
        if (fs.existsSync(playlistPath) && !hasResolved) {
          clearInterval(playlistCheckInterval);
          hasResolved = true;
          this.isRunning = true;
          const hlsUrl = `/api/v1/gate-staff/video-stream/hls/stream.m3u8`;
          console.log('✅ Stream started (playlist found via polling):', playlistPath);
          resolve({
            success: true,
            hlsUrl
          });
        }
      }, 1000); // Check every 1 second

      // Timeout after 20 seconds if stream doesn't start
      setTimeout(() => {
        clearInterval(playlistCheckInterval);
        if (!hasResolved) {
          hasResolved = true;
          
          // Check if there were recent errors
          const recentError = errorMessages.length > 0 && (Date.now() - lastErrorTime < 5000);
          
          if (fs.existsSync(playlistPath)) {
            this.isRunning = true;
            const hlsUrl = `/api/v1/gate-staff/video-stream/hls/stream.m3u8`;
            resolve({
              success: true,
              hlsUrl
            });
          } else {
            let errorMessage = 'Stream failed to start within timeout period';
            if (recentError) {
              errorMessage = `Stream failed to start: ${errorMessages[errorMessages.length - 1]}`;
            } else if (errorMessages.length > 0) {
              errorMessage = `Stream failed: ${errorMessages.join('; ')}`;
            } else {
              errorMessage = 'Stream failed to start. Possible causes: RTSP URL incorrect, camera unreachable, or FFmpeg encoding issue. Check server logs for details.';
            }
            
            // Kill the process if it's still running
            if (this.ffmpegProcess) {
              this.ffmpegProcess.kill('SIGTERM');
              this.ffmpegProcess = null;
            }
            
            resolve({
              success: false,
              error: errorMessage
            });
          }
        }
      }, 20000); // Increased to 20 seconds
    });
  }

  /**
   * Stop FFmpeg stream
   */
  public stopStream(): void {
    if (this.ffmpegProcess) {
      console.log('🛑 Stopping FFmpeg stream...');
      this.ffmpegProcess.kill('SIGTERM');
      this.ffmpegProcess = null;
    }
    this.isRunning = false;
    this.currentConfig = null;
  }

  /**
   * Get current stream status
   */
  public getStatus(): {
    isRunning: boolean;
    rtspUrl?: string;
    playlistExists: boolean;
  } {
    const playlistPath = this.currentConfig?.playlistPath || path.join(process.cwd(), 'hls', 'stream.m3u8');
    const playlistExists = fs.existsSync(playlistPath);

    return {
      isRunning: this.isRunning,
      rtspUrl: this.currentConfig?.rtspUrl,
      playlistExists
    };
  }

  /**
   * Check if FFmpeg is available
   */
  public static async checkFFmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpegCheck = spawn('ffmpeg', ['-version']);
      
      ffmpegCheck.on('close', (code) => {
        resolve(code === 0);
      });

      ffmpegCheck.on('error', () => {
        resolve(false);
      });

      // Timeout after 3 seconds
      setTimeout(() => {
        ffmpegCheck.kill();
        resolve(false);
      }, 3000);
    });
  }
}

export default VideoStreamService;

