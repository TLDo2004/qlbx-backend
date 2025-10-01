import express from 'express';
import cors from 'cors';
import mongoService from './services/_mongoservice';
import routes from './routes';

export const app = express();

app.use(cors({ origin: true }));

app.use(express.json());
app.use(express.raw({ type: 'application/vnd.custom-type' }));
app.use(express.text({ type: 'text/html' }));

// Healthcheck endpoint
app.get('/', (req, res) => {
  res.status(200).send({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// MongoDB health check endpoint
app.get('/health', async (req, res) => {
  try {
    const mongoHealth = await mongoService.healthCheck();
    const connectionInfo = mongoService.getConnectionInfo();

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        mongodb: {
          status: mongoHealth ? 'connected' : 'disconnected',
          ...connectionInfo
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

const api = express.Router();

api.get('/hello', (req, res) => {
  res.status(200).send({ message: 'hello world' });
});

// Mount all routes
app.use('/api/v1', routes);

// Version the api
app.use('/api/v1', api);
