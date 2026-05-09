import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { authRouter } from './routes/auth.js';
import { taskRouter } from './routes/tasks.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { swaggerSpec } from './swagger.js';
import { logger } from './services/logger.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api/auth', rateLimiter, authRouter);
app.use('/api/tasks', taskRouter);
app.use(errorHandler);

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');
    app.listen(PORT, () => logger.info({ port: PORT }, 'Backend running'));
  } catch (err) {
    logger.error({ err }, 'Failed to start');
    process.exit(1);
  }
}

start();

export default app;
