import { config } from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  config();
}

// Import services and app
import mongoService from './services/_mongoservice';
import { httpServer, io } from './api';
import firebaseAdmin from './services/_firebaseservice';

const port = process.env.PORT || 3333;

// WebSocket authentication middleware
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        
        if (!token) {
            return next(new Error('Authentication token required'));
        }

        // Verify Firebase token
        try {
            const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
            (socket as any).uid = decodedToken?.uid;
            next();
        } catch (error) {
            console.error('[WebSocket] Token verification failed:', error);
            next(new Error('Invalid authentication token'));
        }
    } catch (error) {
        console.error('[WebSocket] Authentication error:', error);
        next(new Error('Authentication failed'));
    }
});

// WebSocket connection handling
io.on('connection', (socket) => {
    const uid = (socket as any).uid;
    console.log(`[WebSocket] Client connected: ${socket.id}, UID: ${uid}`);
    
    socket.on('disconnect', () => {
        console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    });
});

// Start server
const startServer = async () => {
    try {
        // Ensure MongoDB is connected before starting server
        if (!mongoService.isConnected()) {
            console.log('Waiting for MongoDB connection...');
            await mongoService.connect();
        }

        // Start the server with HTTP server (for WebSocket support)
        httpServer.listen(port, () => {
            console.log(`API available on http://localhost:${port}`);
            console.log(`WebSocket server ready on ws://localhost:${port}`);
            console.log(`MongoDB Status: ${mongoService.isConnected() ? 'Connected' : 'Disconnected'}`);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
