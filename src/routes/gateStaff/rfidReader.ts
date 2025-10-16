import express from 'express';
import { gateStaffAuth } from '../../middleware';
import { badRequest, internalError } from '../../utils';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import RfidBufferService from '../../services/rfidBufferService';

const rfidRouter = express.Router();

interface IRFIDStreamRequest extends express.Request {
  body: {
    comPort: string; // e.g. "COM5"
    baudRate?: number; // default 57600 for PK-201UT
    gateId: string; // e.g. "gate_01_in", "gate_01_out"
  };
}

// POST /rfid/alertStream - Listen to RFID reader via Serial COM
rfidRouter.post('/alertStream', gateStaffAuth, async (req: IRFIDStreamRequest, res: express.Response): Promise<void> => {
  try {
    const { comPort, baudRate = 57600, gateId } = req.body;

    if (!comPort || typeof comPort !== 'string') {
      badRequest(res, 'Missing or invalid field: comPort');
      return;
    }
    if (typeof baudRate !== 'number' || baudRate <= 0) {
      badRequest(res, 'Invalid baudRate');
      return;
    }
    if (!gateId || typeof gateId !== 'string') {
      badRequest(res, 'Missing or invalid field: gateId');
      return;
    }

    // Basic COM port format validation (e.g. COM1, COM12)
    const comRegex = /^COM\d+$/i;
    if (!comRegex.test(comPort)) {
      badRequest(res, 'Invalid COM port format. Example: COM5');
      return;
    }

    // Prepare Server-Sent Events headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    });

    req.setTimeout(0);
    res.setTimeout(0);

    res.write('data: {"type":"connected","message":"Connected to RFID serial stream"}\n\n');

    let port: any = null;
    let parser: any = null;

    try {
      // Chống trùng lặp: chỉ phát khi EPC thay đổi so với lần gần nhất
      let lastEmittedEpc: string | null = null;

      // Gom các mảnh dữ liệu liên tiếp thành một "burst"
      let burstParts: string[] = [];
      let burstTimer: NodeJS.Timeout | null = null;

      port = new SerialPort({ path: comPort, baudRate, autoOpen: false });

      port.open((openErr) => {
        if (openErr) {
          if (!res.destroyed) {
            res.write(`data: ${JSON.stringify({ type: 'error', error: `Failed to open ${comPort}: ${openErr.message}` })}\n\n`);
            res.end();
          }
          return;
        }

        // Parse line-by-line nếu có CR/LF
        parser = port ? port.pipe(new ReadlineParser({ delimiter: '\n' })) : null;

        // Tắt phát theo dòng để chỉ còn EPC
        if (parser) {
          parser.on('data', (_line: string) => {
            // no-op
          });
        }

        // Đồng thời lắng nghe dữ liệu nhị phân thô (trường hợp thiết bị không gửi CR/LF)
        if (port) {
          port.on('data', (chunk: Buffer) => {
            if (res.destroyed || !chunk || chunk.length === 0) return;
            const hex = chunk.toString('hex').toUpperCase();

            // Gom burst
            burstParts.push(hex);
            if (burstTimer) clearTimeout(burstTimer);
            burstTimer = setTimeout(() => {
              const burstHex = burstParts.join('');
              burstParts = [];

              if (!res.destroyed && burstHex.length > 0) {
                // Trích xuất EPC theo 2 dạng phổ biến:
                // 1) Khung có prefix 07 00 EE 00 + 4 bytes EPC (ví dụ demo: 07 00 EE 00 18 9D 54 1A)
                // 2) Dòng hex bắt đầu bằng E2... (một số reader trả EPC bắt đầu E2)
                const found = new Set<string>();

                // Dạng 1: 0700EE00XXXXXXXX (XXXXXXXX = 8 hex = 4 bytes EPC)
                const rePk201 = /0700EE00([0-9A-F]{8})/g;
                let m1: RegExpExecArray | null;
                while ((m1 = rePk201.exec(burstHex)) !== null) {
                  found.add(m1[1]);
                }

                // Dạng 2: E2 + ≥ 6 hex (giữ nguyên nếu bắt gặp)
                const reE2 = /(E2[0-9A-F]{6,})/g;
                let m2: RegExpExecArray | null;
                while ((m2 = reE2.exec(burstHex)) !== null) {
                  found.add(m2[1]);
                }

                for (const tag of found) {
                  if (tag !== lastEmittedEpc) {
                    lastEmittedEpc = tag;
                    
                    // Add RFID event to buffer
                    try {
                      const rfidBufferService = RfidBufferService.getInstance();
                      const eventId = rfidBufferService.addRfidEvent({
                        rfid_etc: tag,
                        timestamp: new Date(),
                        gateId: gateId
                      });
                      
                      console.log(`RFID event added to buffer: ${eventId} (EPC: ${tag}, Gate: ${gateId})`);
                      
                      // Send to client
                      res.write(`data: ${JSON.stringify({ 
                        type: 'rfid-epc', 
                        timestamp: new Date().toISOString(), 
                        epc: tag,
                        gateId: gateId,
                        bufferEventId: eventId
                      })}\n\n`);
                    } catch (bufferError) {
                      console.error('Error adding RFID event to buffer:', bufferError);
                      // Still send to client even if buffer fails
                      res.write(`data: ${JSON.stringify({ 
                        type: 'rfid-epc', 
                        timestamp: new Date().toISOString(), 
                        epc: tag,
                        gateId: gateId,
                        error: 'Buffer error'
                      })}\n\n`);
                    }
                  }
                  // Nếu cần chỉ phát EPC đầu tiên mỗi burst, có thể break; ở đây cho phép nhiều EPC khác nhau trong cùng burst
                }
              }
            }, 40); // 40ms không nhận thêm bytes => kết thúc 1 burst
          });
        }

        if (port) {
          port.on('error', (err) => {
            console.error('SerialPort error:', err);
            if (!res.destroyed) {
              res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
            }
          });

          port.on('close', () => {
            if (!res.destroyed) {
              res.write('data: {"type":"disconnected","message":"Serial port closed"}\n\n');
              res.end();
            }
          });
        }
      });

    } catch (serialErr: any) {
      console.error('Failed to initialize SerialPort:', serialErr);
      internalError(res, 'Failed to initialize SerialPort');
      return;
    }

    // Client disconnect handling
    const cleanup = () => {
      try {
        if (parser) {
          parser.removeAllListeners();
        }
        if (port && port.isOpen) {
          port.close();
        }
      } catch (_) {
        // ignore
      }
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);

    // Keepalive
    const keepAlive = setInterval(() => {
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify({ type: 'keepalive', timestamp: new Date().toISOString() })}\n\n`);
      } else {
        clearInterval(keepAlive);
        cleanup();
      }
    }, 10000);

  } catch (error: any) {
    console.error('Error in RFID alert stream endpoint:', error);
    internalError(res, 'Internal server error while setting up RFID stream');
  }
});

export default rfidRouter;


