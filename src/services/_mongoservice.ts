import mongoose from 'mongoose';

// MongoDB Configuration
const MONGODB_CONFIG = {
  url: process.env.MONGODB_URL || "mongodb://localhost:27017/qlbx_database",
  options: {
    maxPoolSize: 10, // Maintain up to 10 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    bufferCommands: false, // Disable mongoose buffering
  }
};

// Connection state
let isConnected = false;

// MongoDB Service Class
class MongoService {
  private static instance: MongoService;

  private constructor() {}

  public static getInstance(): MongoService {
    if (!MongoService.instance) {
      MongoService.instance = new MongoService();
    }
    return MongoService.instance;
  }

  // Connect to MongoDB
  public async connect(): Promise<void> {
    if (isConnected) {
      console.log('MongoDB already connected');
      return;
    }

    try {     
      await mongoose.connect(MONGODB_CONFIG.url, MONGODB_CONFIG.options);
      
      isConnected = true;
      console.log('MongoDB connected successfully');
      
      // Handle connection events
      this.setupConnectionEvents();
      
    } catch (error) {
      console.error('MongoDB connection error:', error);
      isConnected = false;
      throw error;
    }
  }

  // Disconnect from MongoDB
  public async disconnect(): Promise<void> {
    if (!isConnected) {
      console.log('MongoDB already disconnected');
      return;
    }

    try {
      await mongoose.disconnect();
      isConnected = false;
      console.log('MongoDB disconnected successfully');
    } catch (error) {
      console.error('MongoDB disconnection error:', error);
      throw error;
    }
  }

  // Get connection status
  public isConnected(): boolean {
    return isConnected && mongoose.connection.readyState === 1;
  }

  // Get connection info
  public getConnectionInfo() {
    return {
      isConnected: this.isConnected(),
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
    };
  }

  // Setup connection event handlers
  private setupConnectionEvents(): void {
    const connection = mongoose.connection;

    connection.on('connected', () => {
      console.log('MongoDB connected');
      isConnected = true;
    });

    connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
      isConnected = false;
    });

    connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      isConnected = false;
    });

    connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
      isConnected = true;
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      console.log('Received SIGINT, closing MongoDB connection...');
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, closing MongoDB connection...');
      await this.disconnect();
      process.exit(0);
    });
  }

  // Health check
  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        return false;
      }
      
      // Ping the database
      await mongoose.connection.db.admin().ping();
      return true;
    } catch (error) {
      console.error('MongoDB health check failed:', error);
      return false;
    }
  }
}

// Create singleton instance
const mongoService = MongoService.getInstance();

// Auto-connect on import
mongoService.connect().catch(console.error);

// Export the service
export default mongoService;
export { MongoService };