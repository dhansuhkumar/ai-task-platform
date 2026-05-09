import { Router } from 'express';
import { z } from 'zod';
import { Task, OPERATIONS } from '../models/Task.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { pushTask } from '../services/queue.js';
import { taskSSEMiddleware, sendTaskUpdate } from '../services/sse.js';
import { logger } from '../services/logger.js';

export const taskRouter = Router();

taskRouter.use(authMiddleware);

const createSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  inputText: z.string().min(1, 'Input text is required'),
  operation: z.enum(OPERATIONS, { errorMap: () => ({ message: `Operation must be one of: ${OPERATIONS.join(', ')}` }) }),
});

taskRouter.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const { title, inputText, operation } = req.parsedBody;
    const task = await Task.create({ userId: req.userId, title, inputText, operation });
    const pushed = await pushTask(task._id.toString());
    if (!pushed) {
      task.logs.push('WARNING: Redis unavailable, task queued in DB');
      await task.save();
    }
    sendTaskUpdate(req.userId, task.toObject());
    logger.info({ taskId: task._id, operation }, 'Task created');
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

taskRouter.get('/', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = { userId: req.userId };
    if (status) filter.status = status;
    const tasks = await Task.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-logs');
    const total = await Task.countDocuments(filter);
    res.json({ tasks, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

taskRouter.get('/stream', (req, res, next) => {
  taskSSEMiddleware(req, res);
});

taskRouter.get('/:id', async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.userId });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    next(err);
  }
});
