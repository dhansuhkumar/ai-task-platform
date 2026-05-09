import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import supertest from 'supertest';
import app from '../src/index.js';

const request = supertest(app);
let token;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-task-platform-test');
  const res = await request.post('/api/auth/register').send({ email: 'task-test@test.com', password: 'test123' });
  token = res.body.token;
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('Task Routes', () => {
  it('should create a task', async () => {
    const res = await request
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test', inputText: 'hello', operation: 'uppercase' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
  });

  it('should reject invalid operation', async () => {
    const res = await request
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test', inputText: 'hello', operation: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('should list tasks', async () => {
    const res = await request
      .get('/api/tasks')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toBeInstanceOf(Array);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('should reject unauthenticated requests', async () => {
    const res = await request.post('/api/tasks').send({ title: 'Test', inputText: 'hello', operation: 'uppercase' });
    expect(res.status).toBe(401);
  });
});
