import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from './models/User.js';
import { Task } from './models/Task.js';
import { pushTask } from './services/queue.js';
import { logger } from './services/logger.js';

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  logger.info('Connected to MongoDB for seeding');

  await User.deleteMany({});
  await Task.deleteMany({});

  const user = await User.create({ email: 'demo@example.com', password: 'demo123' });
  logger.info({ userId: user._id }, 'Created demo user (demo@example.com / demo123)');

  const samples = [
    { title: 'Uppercase Test', inputText: 'hello world from AI platform', operation: 'uppercase' },
    { title: 'Lowercase Test', inputText: 'HELLO FROM AI PLATFORM', operation: 'lowercase' },
    { title: 'Reverse Test', inputText: 'AI Task Platform', operation: 'reverse' },
    { title: 'Word Count Test', inputText: 'This is a sample text with eight words here', operation: 'word_count' },
  ];

  for (const s of samples) {
    const task = await Task.create({ userId: user._id, ...s });
    await pushTask(task._id.toString());
    logger.info({ taskId: task._id, operation: s.operation }, 'Seeded task');
  }

  logger.info('Seeding complete. Demo credentials: demo@example.com / demo123');
  await mongoose.disconnect();
}

seed().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
