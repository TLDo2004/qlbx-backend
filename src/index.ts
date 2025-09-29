import { config } from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  config();
}

// Import services and app
import mongoService from './services/_mongoservice';
import { app } from './api';

const port = process.env.PORT || 3333;

// Start server
const startServer = async () => {
    try {
        // Ensure MongoDB is connected before starting server
        if (!mongoService.isConnected()) {
            console.log('Waiting for MongoDB connection...');
            await mongoService.connect();
        }

        // Start the server
        app.listen(port, () => {
            console.log(`API available on http://localhost:${port}`);
            console.log(`MongoDB Status: ${mongoService.isConnected() ? 'Connected' : 'Disconnected'}`);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
