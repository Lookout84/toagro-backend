import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import http from 'http';
import { setupSwagger } from './swagger';
import { initSocket } from './sockets/chatSocket';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { prisma } from './config/db';
import { redisClient } from './utils/redis';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Swagger
setupSwagger(app);

// Routes
app.use('/api/v1', routes);

// WebSocket
initSocket(io);

// Health Check
app.get('/health', async (req, res) => {
  const dbStatus = await prisma.$queryRaw`SELECT 1`
    .then(() => 'OK')
    .catch(() => 'Error');
  const redisStatus = await redisClient.ping() === 'PONG' ? 'OK' : 'Error';
  res.json({ status: 'UP', db: dbStatus, redis: redisStatus });
});

// Error Handling
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});