import express from 'express';
import { internalError, badRequest } from '../../utils';
import { gateStaffAuth } from '../../middleware/index';
import { spawn } from 'child_process';
import CameraBufferService from '../../services/cameraBufferService';

const anprRouter = express.Router();

// Interface for ANPR snapshot request
interface IANPRSnapshotRequest extends express.Request {
  body: {
    ipAddress: string;
    username: string;
    password: string;
    channel?: number; // Optional channel number, defaults to 1
  };
}

// Interface for ANPR stream request
interface IANPRStreamRequest extends express.Request {
  body: {
    ipAddress: string;
    username: string;
    password: string;
    gateId: string; // e.g. "gate_01_in", "gate_01_out"
  };
}

// Interface for image search request
interface IImageSearchRequest extends express.Request {
  body: {
    ipAddress: string;
    username: string;
    password: string;
    startTime?: string; // ISO format: 2025-10-08T00:00:00Z
    endTime?: string;   // ISO format: 2025-10-08T23:59:59Z
    trackID?: number;   // Default: 103
    maxResults?: number; // Default: 50
  };
}

// Interface for download image request
interface IDownloadImageRequest extends express.Request {
  body: {
    username: string;
    password: string;
    downloadURL: string; // Full ISAPI URL from search result (may contain &amp;)
  };
}

// POST /anpr/snapshot - Get snapshot from ANPR camera via ISAPI
anprRouter.post('/snapshot', gateStaffAuth, async (req: IANPRSnapshotRequest, res: express.Response): Promise<void> => {
  try {
    const { ipAddress, username, password, channel = 1 } = req.body;

    // Validate required fields
    if (!ipAddress || !username || !password) {
      badRequest(res, 'Missing required fields: ipAddress, username, password');
      return;
    }

    // Validate IP address format
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ipAddress)) {
      badRequest(res, 'Invalid IP address format');
      return;
    }

    // Validate channel number
    if (channel < 1 || channel > 32) {
      badRequest(res, 'Channel number must be between 1 and 32');
      return;
    }

    const isapiUrl = `http://${ipAddress}/ISAPI/Streaming/channels/${channel}/picture`;
    
    // Use curl with digest authentication to get snapshot
    const curl = spawn("curl", [
      "--digest",
      "-u", `${username}:${password}`,
      "--silent", // Suppress progress information
      isapiUrl
    ]);

    let imageData = Buffer.alloc(0);

    curl.stdout.on("data", (chunk: Buffer) => {
      imageData = Buffer.concat([imageData, chunk]);
    });

    curl.stderr.on("data", (err: Buffer) => {
      // Only log actual errors, not progress information
      const errorText = err.toString();
      if (!errorText.includes('% Total') && !errorText.includes('--:--:--')) {
        console.error('Curl error:', errorText);
      }
    });

    curl.on('exit', (code: number) => {
      if (code === 0 && imageData.length > 0) {
        // Set appropriate headers for image response
        res.set({
          'Content-Type': 'image/jpeg',
          'Content-Length': imageData.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });

        // Send the image data
        res.send(imageData);
      } else {
        console.error(`Curl exit code: ${code}, Image data length: ${imageData.length}`);
        badRequest(res, 'Failed to retrieve snapshot from camera');
      }
    });

    curl.on('error', (error: any) => {
      console.error('Curl process error:', error);
      badRequest(res, 'Failed to execute curl command');
    });

  } catch (error: any) {
    console.error('Error in ANPR snapshot endpoint:', error);
    internalError(res, 'Internal server error while processing snapshot request');
  }
});

// POST /anpr/alertStream - Listen to camera events via ISAPI streaming
anprRouter.post('/alertStream', gateStaffAuth, async (req: IANPRStreamRequest, res: express.Response): Promise<void> => {
  try {
    const { ipAddress, username, password, gateId } = req.body;

    // Validate required fields
    if (!ipAddress || !username || !password || !gateId) {
      badRequest(res, 'Missing required fields: ipAddress, username, password, gateId');
      return;
    }

    // Validate IP address format
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ipAddress)) {
      badRequest(res, 'Invalid IP address format');
      return;
    }

    const isapiUrl = `http://${ipAddress}/ISAPI/Event/notification/alertStream`;
    
    try {
      // Set up Server-Sent Events headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
      });

      // Disable Express timeout for this response
      req.setTimeout(0);
      res.setTimeout(0);

      // Send initial connection message
      res.write('data: {"type": "connected", "message": "Connected to camera alert stream"}\n\n');
      
      // Debug response events
      res.on('close', () => {
        console.log('🔌 Response closed');
        stopped = true;
        if (currentCurl) {
          console.log('🛑 Killing curl process due to response close');
          currentCurl.kill('SIGTERM');
        }
      });
      
      res.on('finish', () => {
        console.log('✅ Response finished');
      });
      
      res.on('error', (err) => {
        console.log('❌ Response error:', err);
        stopped = true;
        if (currentCurl) {
          console.log('🛑 Killing curl process due to response error');
          currentCurl.kill('SIGTERM');
        }
      });

      // Auto-reconnectable curl process
      let stopped = false;
      let currentCurl: any = null;
      
      const startCurl = () => {
        if (stopped || res.destroyed) {
          console.log('🚫 startCurl blocked: stopped=', stopped, 'res.destroyed=', res.destroyed);
          return;
        }
        
        // Use curl with digest authentication (like your working test)
        const curl = spawn("curl", [
          "--digest",
          "-u", `${username}:${password}`,
          "--no-buffer", // ensure streaming output without buffering
          "--silent",
          "--connect-timeout", "10",
          "--max-time", "0",
          isapiUrl
        ]);
        currentCurl = curl;
        console.log(`🚀 Starting curl process for: ${isapiUrl}`);
        console.log(`🔐 Using credentials: ${username}:${password}`);
        console.log(`📋 Curl command: curl --digest -u ${username}:${password} --no-buffer --silent --connect-timeout 10 --max-time 0 ${isapiUrl}`);
        console.log(`✅ Curl process spawned with PID: ${curl.pid}`);

        let buffer = Buffer.alloc(0);
        let boundary: string | null = null;

        // Handle curl stdout data
        curl.stdout.on("data", (chunk: Buffer) => {
          if (res.destroyed) {
            console.log('🚫 curl stdout blocked: res.destroyed=', res.destroyed);
            return;
          }
          
          console.log(`📥 Curl stdout data received: ${chunk.length} bytes`);
          buffer = Buffer.concat([buffer, chunk]);

          // Detect boundary (only need to do this once)
          if (!boundary) {
            const match = buffer.toString().match(/^--([A-Za-z0-9_\-]+)\r\n/);
            if (match) boundary = match[1];
          }

          if (boundary) {
            // Process by boundary - use binary buffer instead of string
            const boundaryBuffer = Buffer.from(`--${boundary}`);
            const parts: Buffer[] = [];
            let start = 0;
            
            while (true) {
              const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
              if (boundaryIndex === -1) break;
              
              if (start < boundaryIndex) {
                parts.push(buffer.slice(start, boundaryIndex));
              }
              start = boundaryIndex + boundaryBuffer.length;
            }
            
            // Keep the incomplete part
            buffer = buffer.slice(start);

            for (const part of parts) {
              if (part.length === 0) continue;
              
              // Find header boundary
              const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
              if (headerEnd === -1) continue;

              const headers = part.slice(0, headerEnd).toString();
              const body = part.slice(headerEnd + 4);

                  // Get content type and filename
                  const typeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
                  const filenameMatch = headers.match(/filename="([^"]+)"/);
                  const contentType = typeMatch ? typeMatch[1] : null;
                  const filename = filenameMatch ? filenameMatch[1] : null;
                  
                  console.log(`📋 Content-Type: ${contentType}, Filename: ${filename}, Body size: ${body.length} bytes`);

              if (contentType === "application/xml" || contentType === "text/xml") {
                // Send XML data as event (original logic)
                res.write(`data: ${JSON.stringify({
                  type: 'event',
                  timestamp: new Date().toISOString(),
                  data: body.toString(),
                  format: 'xml',
                  filename: filename,
                  contentType: contentType
                })}\n\n`);
                
                // Extract license plate and add to buffer
                try {
                  const xmlData = body.toString();
                  console.log('📄 XML Data received:', xmlData.substring(0, 200) + '...');
                  
                  const licensePlate = extractLicensePlateFromXML(xmlData);
                  console.log('🔍 Extracted license plate:', licensePlate);
                  
                  if (licensePlate) {
                    const cameraBufferService = CameraBufferService.getInstance();
                    const eventId = cameraBufferService.addCameraEvent({
                      license_plate: licensePlate,
                      timestamp: new Date(),
                      gateId: gateId,
                      imageData: null
                    });
                    
                    console.log(`🎯 Camera event added to buffer: ${eventId} (License: ${licensePlate}, Gate: ${gateId})`);
                  } else {
                    console.log('❌ No license plate found in XML data');
                  }
                } catch (bufferError) {
                  console.error('Error processing camera event for buffer:', bufferError);
                  // Don't break the original flow
                }
              } else if (contentType === "image/jpeg" || contentType === "image/jpg") {
                // Send image data
                console.log(`🖼️ Image received: ${filename}, size: ${body.length} bytes`);
                res.write(`data: ${JSON.stringify({
                  type: 'image',
                  timestamp: new Date().toISOString(),
                  data: body.toString('base64'),
                  format: 'jpeg',
                  filename: filename,
                  contentType: contentType,
                  size: body.length
                })}\n\n`);
              } else if (contentType) {
                // Send other content types
                res.write(`data: ${JSON.stringify({
                  type: 'data',
                  timestamp: new Date().toISOString(),
                  data: body.toString('base64'),
                  format: contentType,
                  filename: filename,
                  size: body.length
                })}\n\n`);
              }
            }
          }
        });

        // Handle curl stderr
        curl.stderr.on("data", (err: Buffer) => {
          const errorText = err.toString();
          console.error('❌ Curl stderr:', errorText);
          if (!res.destroyed) {
            res.write(`data: ${JSON.stringify({
              type: 'error',
              timestamp: new Date().toISOString(),
              error: errorText
            })}\n\n`);
          }
        });

        // Handle curl exit (auto-reconnect)
        curl.on('exit', (code: number | null, signal: string | null) => {
          console.log(`🔄 Curl process exited with code ${code}, signal: ${signal}`);
          if (!res.destroyed && !stopped) {
            res.write(`data: ${JSON.stringify({
              type: 'disconnected',
              timestamp: new Date().toISOString(),
              message: `curl exited code=${code}, signal=${signal}, reconnecting...`
            })}\n\n`);
            console.log(`🔄 Attempting to reconnect in 2 seconds...`);
            setTimeout(() => {
              if (!res.destroyed && !stopped) {
                startCurl();
              }
            }, 2000);
          }
        });

        // Handle curl error
        curl.on('error', (error: any) => {
          console.error('❌ Curl process error:', error);
          if (!res.destroyed && !stopped) {
            res.write(`data: ${JSON.stringify({
              type: 'error',
              timestamp: new Date().toISOString(),
              error: error.message
            })}\n\n`);
          }
        });
      };

      // Kick off first connection
      startCurl();

      // Handle client disconnect
      req.on('close', () => {
        console.log('🔌 Client disconnected from alert stream');
        console.log('🔍 req.destroyed:', req.destroyed);
        console.log('🔍 res.destroyed:', res.destroyed);
        console.log('🔍 stopped:', stopped);
        
        // Only kill curl if response is also destroyed
        if (res.destroyed) {
          stopped = true;
          if (currentCurl) {
            console.log('🛑 Killing curl process due to client disconnect');
            currentCurl.kill('SIGTERM');
          }
        } else {
          console.log('⚠️ Request closed but response still alive, not killing curl');
        }
      });

      req.on('aborted', () => {
        console.log('🔌 Client request aborted');
        console.log('🔍 req.destroyed:', req.destroyed);
        console.log('🔍 res.destroyed:', res.destroyed);
        console.log('🔍 stopped:', stopped);
        
        // Only kill curl if response is also destroyed
        if (res.destroyed) {
          stopped = true;
          if (currentCurl) {
            console.log('🛑 Killing curl process due to client abort');
            currentCurl.kill('SIGTERM');
          }
        } else {
          console.log('⚠️ Request aborted but response still alive, not killing curl');
        }
      });

      // Keep alive mechanism
      const keepAliveInterval = setInterval(() => {
        if (!res.destroyed) {
          console.log('💓 Sending keepalive...');
          res.write('data: {"type": "keepalive", "timestamp": "' + new Date().toISOString() + '"}\n\n');
        } else {
          console.log('🚫 Keepalive stopped: res.destroyed=', res.destroyed);
          clearInterval(keepAliveInterval);
          if (currentCurl) {
            console.log('🛑 Killing curl process from keepalive');
            currentCurl.kill('SIGTERM');
          }
        }
      }, 10000); // Send keepalive every 10 seconds

    } catch (error: any) {
      console.error('Error setting up alert stream:', error);
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        badRequest(res, 'Cannot connect to camera. Please check IP address and network connectivity.');
        return;
      }
      
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        badRequest(res, 'Request timeout. Camera may be busy or unreachable.');
        return;
      }
      
      internalError(res, 'Failed to establish alert stream connection');
    }

  } catch (error: any) {
    console.error('Error in ANPR alert stream endpoint:', error);
    internalError(res, 'Internal server error while setting up alert stream');
  }
});

// POST /anpr/searchImages - Search for images from camera memory card
anprRouter.post('/searchImages', gateStaffAuth, async (req: IImageSearchRequest, res: express.Response): Promise<void> => {
  try {
    const { 
      ipAddress, 
      username, 
      password, 
      startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Default: 24 hours ago
      endTime = new Date().toISOString(), // Default: now
      trackID = 103,
      maxResults = 50
    } = req.body;

    // Validate required fields
    if (!ipAddress || !username || !password) {
      badRequest(res, 'Missing required fields: ipAddress, username, password');
      return;
    }

    // Validate IP address format
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ipAddress)) {
      badRequest(res, 'Invalid IP address format');
      return;
    }

    // Validate time format
    const timeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      badRequest(res, 'Invalid time format. Use ISO format: 2025-10-08T00:00:00Z');
      return;
    }

    // Generate unique search ID
    const searchID = `{${crypto.randomUUID()}}`;
    
    // Create search XML body
    const searchXML = `<CMSearchDescription version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
    <searchID>${searchID}</searchID>
    <trackIDList>
        <trackID>${trackID}</trackID>
    </trackIDList>
    <timeSpanList>
        <timeSpan>
            <startTime>${startTime}</startTime>
            <endTime>${endTime}</endTime>
        </timeSpan>
    </timeSpanList>
    <searchResultPostion>0</searchResultPostion>
    <maxResults>${maxResults}</maxResults>
</CMSearchDescription>`;

    const isapiUrl = `http://${ipAddress}/ISAPI/ContentMgmt/search`;
    
    // Use curl with digest authentication to search for images
    const curl = spawn("curl", [
      "--digest",
      "-u", `${username}:${password}`,
      "--silent",
      "--connect-timeout", "10",
      "--max-time", "30",
      "-X", "POST",
      "-H", "Content-Type: application/xml",
      "-d", searchXML,
      isapiUrl
    ]);

    let responseData = '';

    curl.stdout.on("data", (chunk: Buffer) => {
      responseData += chunk.toString();
    });

    curl.stderr.on("data", (err: Buffer) => {
      const errorText = err.toString();
      if (!errorText.includes('% Total') && !errorText.includes('--:--:--')) {
        console.error('Curl error:', errorText);
      }
    });

    curl.on('exit', (code: number) => {
      if (code === 0 && responseData) {
        try {
          // Parse XML response
          const images = parseSearchResponse(responseData, ipAddress);
          
          res.json({
            success: true,
            message: 'Images retrieved successfully',
            data: {
              searchID: searchID,
              totalMatches: images.length,
              timeRange: {
                startTime: startTime,
                endTime: endTime
              },
              trackID: trackID,
              images: images
            }
          });
        } catch (error) {
          console.error('Error parsing search response:', error);
          badRequest(res, 'Failed to parse search response from camera');
        }
      } else {
        console.error(`Curl exit code: ${code}, Response data length: ${responseData.length}`);
        badRequest(res, 'Failed to search images from camera');
      }
    });

    curl.on('error', (error: any) => {
      console.error('Curl process error:', error);
      badRequest(res, 'Failed to execute curl command');
    });

  } catch (error: any) {
    console.error('Error in ANPR search images endpoint:', error);
    internalError(res, 'Internal server error while searching images');
  }
});

// POST /anpr/downloadImage - Fetch a single image by downloadURL and return bytes
anprRouter.post('/downloadImage', gateStaffAuth, async (req: IDownloadImageRequest, res: express.Response): Promise<void> => {
  try {
    const { username, password, downloadURL } = req.body;

    if (!username || !password || !downloadURL) {
      badRequest(res, 'Missing required fields: username, password, downloadURL');
      return;
    }

    // Decode any HTML entities like &amp; coming from XML
    const url = downloadURL.replace(/&amp;/g, '&');

    // Basic validation to ensure URL points to ISAPI Streaming tracks
    if (!/^https?:\/\/[^\s]+\/ISAPI\/Streaming\/tracks\//i.test(url)) {
      badRequest(res, 'Invalid downloadURL');
      return;
    }

    const curl = spawn('curl', [
      '--digest',
      '-u', `${username}:${password}`,
      '--silent',
      '--connect-timeout', '10',
      '--max-time', '60',
      url
    ]);

    let imageData = Buffer.alloc(0);

    curl.stdout.on('data', (chunk: Buffer) => {
      imageData = Buffer.concat([imageData, chunk]);
    });

    curl.stderr.on('data', (err: Buffer) => {
      const text = err.toString();
      if (!text.includes('% Total') && !text.includes('--:--:--')) {
        console.error('Curl error:', text);
      }
    });

    curl.on('exit', (code: number | null) => {
      if (code === 0 && imageData.length > 0) {
        // Try to detect JPEG/PNG from magic numbers; default to jpeg
        let contentType = 'image/jpeg';
        if (imageData.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]))) {
          contentType = 'image/png';
        }

        res.set({
          'Content-Type': contentType,
          'Content-Length': imageData.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.send(imageData);
      } else {
        console.error(`Curl exit code: ${code}, Image length: ${imageData.length}`);
        badRequest(res, 'Failed to retrieve image');
      }
    });

    curl.on('error', (error: any) => {
      console.error('Curl process error:', error);
      badRequest(res, 'Failed to execute curl command');
    });
  } catch (error: any) {
    console.error('Error in downloadImage endpoint:', error);
    internalError(res, 'Internal server error while downloading image');
  }
});



// Helper function to extract license plate from XML
function extractLicensePlateFromXML(xmlData: string): string | null {
  try {
    // Extract license plate from XML
    const licensePlateRegex = /<licensePlate[^>]*>([^<]+)<\/licensePlate>/i;
    const match = xmlData.match(licensePlateRegex);
    
    if (match && match[1]) {
      return match[1].trim().toUpperCase();
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting license plate from XML:', error);
    return null;
  }
}

// Helper function to parse search response XML
function parseSearchResponse(xmlResponse: string, ipAddress: string): any[] {
  const images: any[] = [];
  
  try {
    // Extract matchList items using regex (simple XML parsing)
    const matchListRegex = /<matchList>([\s\S]*?)<\/matchList>/;
    const matchListMatch = xmlResponse.match(matchListRegex);
    
    if (!matchListMatch) {
      return images;
    }
    
    const matchListContent = matchListMatch[1];
    
    // Extract each searchMatchItem
    const itemRegex = /<searchMatchItem>([\s\S]*?)<\/searchMatchItem>/g;
    let itemMatch;
    
    while ((itemMatch = itemRegex.exec(matchListContent)) !== null) {
      const itemContent = itemMatch[1];
      
      // Extract trackID
      const trackIDMatch = itemContent.match(/<trackID>(.*?)<\/trackID>/);
      const trackID = trackIDMatch ? trackIDMatch[1] : null;
      
      // Extract timeSpan
      const startTimeMatch = itemContent.match(/<startTime>(.*?)<\/startTime>/);
      const endTimeMatch = itemContent.match(/<endTime>(.*?)<\/endTime>/);
      const startTime = startTimeMatch ? startTimeMatch[1] : null;
      const endTime = endTimeMatch ? endTimeMatch[1] : null;
      
      // Extract playbackURI
      const playbackURIMatch = itemContent.match(/<playbackURI>(.*?)<\/playbackURI>/);
      const playbackURI = playbackURIMatch ? playbackURIMatch[1] : null;
      
      // Extract size from playbackURI
      const sizeMatch = playbackURI ? playbackURI.match(/size=(\d+)/) : null;
      const size = sizeMatch ? parseInt(sizeMatch[1]) : null;
      
      // Extract name from playbackURI
      const nameMatch = playbackURI ? playbackURI.match(/name=([^&]+)/) : null;
      const name = nameMatch ? decodeURIComponent(nameMatch[1]) : null;
      
      // Extract contentType
      const contentTypeMatch = itemContent.match(/<contentType>(.*?)<\/contentType>/);
      const contentType = contentTypeMatch ? contentTypeMatch[1] : null;
      
      // Extract codecType
      const codecTypeMatch = itemContent.match(/<codecType>(.*?)<\/codecType>/);
      const codecType = codecTypeMatch ? codecTypeMatch[1] : null;
      
      // Extract metadata descriptor
      const metadataMatch = itemContent.match(/<metadataDescriptor>(.*?)<\/metadataDescriptor>/);
      const metadataDescriptor = metadataMatch ? metadataMatch[1] : null;
      
      if (playbackURI && contentType === 'picture') {
        images.push({
          trackID: trackID,
          startTime: startTime,
          endTime: endTime,
          playbackURI: playbackURI,
          name: name,
          size: size,
          contentType: contentType,
          codecType: codecType,
          metadataDescriptor: metadataDescriptor,
          timestamp: new Date(startTime || '').toISOString()
        });
      }
    }
  } catch (error) {
    console.error('Error parsing XML response:', error);
  }
  
  return images;
}

export default anprRouter;