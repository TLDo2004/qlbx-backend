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
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Ensure hls directory exists
    const hlsDir = path.join(process.cwd(), 'hls');
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }
    
    // Register cleanup handlers for graceful shutdown
    this.registerShutdownHandlers();
  }

  /**
   * Register process exit handlers to cleanup HLS directory on shutdown
   */
  private registerShutdownHandlers(): void {
    const cleanup = () => {
      console.log('🧹 Cleaning up HLS directory on shutdown...');
      this.stopStream(); // This will cleanup HLS directory
    };

    // Handle different termination signals
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('exit', () => {
      // Final cleanup on exit
      this.cleanupHlsDirectory();
    });
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

      // Clean up old segments completely before starting new stream
      try {
        const files = fs.readdirSync(outputDir);
        let deletedCount = 0;
        files.forEach((file) => {
          try {
            const filePath = path.join(outputDir, file);
            if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
              fs.unlinkSync(filePath);
              deletedCount++;
            }
          } catch (fileError) {
            console.warn(`Warning: Could not delete ${file}:`, fileError);
          }
        });
        if (deletedCount > 0) {
          console.log(`🗑️ Cleaned up ${deletedCount} old file(s) before starting new stream`);
        }
        
        // Verify cleanup - ensure playlist is deleted
        if (fs.existsSync(playlistPath)) {
          try {
            fs.unlinkSync(playlistPath);
            console.log('🗑️ Deleted old playlist file');
          } catch (e) {
            console.warn('Warning: Could not delete playlist:', e);
          }
        }
      } catch (error) {
        console.error('Error cleaning up old segments:', error);
      }

      this.currentConfig = {
        rtspUrl,
        outputDir,
        playlistPath,
      };

      // FFmpeg command to convert RTSP → HLS
      // Note: When playlist file doesn't exist, FFmpeg will start from sequence 0
      // Note: FFmpeg will reset media sequence automatically when playlist is deleted
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
        '-hls_list_size', '3',             // Keep only 3 segments (6 seconds) for live streaming only
        '-hls_flags', 'delete_segments+independent_segments',   // Delete old segments, independent segments (removed append_list to force reset)
        '-hls_allow_cache', '0',           // Disable cache
        '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
        '-hls_start_number_source', 'epoch',  // Start numbering from epoch (always fresh start)
        '-start_number', '0',              // Force start from segment 0
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
        // Don't log stderr to reduce console noise

        // Check for errors in FFmpeg output (ignore segment deletion errors)
        // These are harmless - FFmpeg tries to delete segments that were already deleted by periodic cleanup
        const isSegmentDeletionError = output.includes('failed to delete old segment') && 
                                       (output.includes('No such file or directory') || 
                                        output.includes('segment_'));
        
        if (!isSegmentDeletionError && (
            output.toLowerCase().includes('error') || 
            output.toLowerCase().includes('failed') ||
            output.toLowerCase().includes('connection refused') ||
            output.toLowerCase().includes('unable to open') ||
            output.toLowerCase().includes('server returned 404') ||
            output.toLowerCase().includes('authentication failed'))) {
          errorMessages.push(output.trim());
          lastErrorTime = Date.now();
          console.error('❌ FFmpeg error detected:', output);
        }

        // Check if stream has started successfully
        if (!hasResolved && (output.includes('Stream #') || output.includes('frame=') || output.includes('Opening'))) {
          // Poll for playlist file creation
          const checkPlaylist = setInterval(() => {
            if (fs.existsSync(playlistPath) && !hasResolved) {
              // Verify playlist starts from sequence 0 (new stream)
              try {
                const playlistContent = fs.readFileSync(playlistPath, 'utf-8');
                const mediaSequenceMatch = playlistContent.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
                const mediaSequence = mediaSequenceMatch ? parseInt(mediaSequenceMatch[1]) : -1;
                
                if (mediaSequence === 0 || mediaSequence === -1) {
                  // Good - starting from 0 or no sequence yet
                  clearInterval(checkPlaylist);
                  hasResolved = true;
                  this.isRunning = true;
                  const hlsUrl = `/api/v1/gate-staff/video-stream/hls/stream.m3u8`;
                  console.log('✅ Stream started successfully, playlist created:', playlistPath);
                  console.log(`📋 Playlist media sequence: ${mediaSequence}`);
                  
                  // Start periodic cleanup of old segments (keep only recent ones)
                  this.startPeriodicCleanup();
                  
                  resolve({
                    success: true,
                    hlsUrl
                  });
                } else {
                  // Old sequence detected - wait a bit more for FFmpeg to reset
                  console.log(`⏳ Waiting for playlist reset (current sequence: ${mediaSequence})...`);
                }
              } catch (readError) {
                // If can't read, continue waiting
                console.warn('Could not read playlist:', readError);
              }
            }
          }, 500); // Check every 500ms

          // Stop checking after 10 seconds (increased to allow for sequence reset)
          setTimeout(() => {
            clearInterval(checkPlaylist);
          }, 10000);
        }
      });

      // Handle process close
      this.ffmpegProcess.on('close', (code) => {
        console.log(`❌ FFmpeg process ended with code: ${code}`);
        this.isRunning = false;
        this.ffmpegProcess = null;
        
        // Stop periodic cleanup
        this.stopPeriodicCleanup();

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
          
          // Start periodic cleanup of old segments
          this.startPeriodicCleanup();
          
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
            
            // Start periodic cleanup
            this.startPeriodicCleanup();
            
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
    
    // Stop periodic cleanup
    this.stopPeriodicCleanup();
    
    // Cleanup HLS directory when stopping stream
    this.cleanupHlsDirectory();
    
    this.isRunning = false;
    this.currentConfig = null;
  }

  /**
   * Start periodic cleanup of old HLS segments (keep only live segments)
   */
  private startPeriodicCleanup(): void {
    // Stop existing cleanup if any
    this.stopPeriodicCleanup();
    
    // Clean up old segments every 5 seconds
    this.cleanupInterval = setInterval(() => {
      if (!this.currentConfig || !this.isRunning) {
        this.stopPeriodicCleanup();
        return;
      }
      
      try {
        const outputDir = this.currentConfig.outputDir;
        if (!fs.existsSync(outputDir)) {
          return;
        }
        
        const files = fs.readdirSync(outputDir);
        const segmentFiles = files
          .filter(file => file.endsWith('.ts'))
          .map(file => ({
            name: file,
            path: path.join(outputDir, file),
            mtime: fs.statSync(path.join(outputDir, file)).mtime.getTime()
          }))
          .sort((a, b) => b.mtime - a.mtime); // Sort by modification time, newest first
        
        // Keep only the 3 most recent segments (matching hls_list_size)
        if (segmentFiles.length > 3) {
          const toDelete = segmentFiles.slice(3);
          toDelete.forEach(segment => {
            try {
              fs.unlinkSync(segment.path);
              // Don't log segment deletion to reduce console noise
            } catch (err) {
              // Ignore errors (file might already be deleted by FFmpeg)
            }
          });
        }
      } catch (error) {
        // Ignore cleanup errors
        console.error('Error during segment cleanup:', error);
      }
    }, 5000); // Run every 5 seconds
  }

  /**
   * Stop periodic cleanup
   */
  private stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Cleanup entire HLS directory (delete all files)
   */
  private cleanupHlsDirectory(): void {
    try {
      const hlsDir = path.join(process.cwd(), 'hls');
      if (!fs.existsSync(hlsDir)) {
        return;
      }

      const files = fs.readdirSync(hlsDir);
      let deletedCount = 0;
      
      files.forEach((file) => {
        try {
          const filePath = path.join(hlsDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.isFile()) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (error) {
          // Ignore errors for individual files
          console.warn(`Warning: Could not delete file ${file}:`, error);
        }
      });

      if (deletedCount > 0) {
        console.log(`🗑️ Cleaned up ${deletedCount} file(s) from HLS directory`);
      }
    } catch (error) {
      console.error('Error cleaning up HLS directory:', error);
    }
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

