import { logger } from '../services/logger.js';

export function errorHandler(err, _req, res, _next) {
  logger.error({ err, message: err.message });

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate key error' });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
}
