import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import supertest from 'supertest';
import app from '../src/index.js';

const request = supertest(app);

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-task-platform-test');
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('Auth Routes', () => {
  const testUser = { email: 'test@test.com', password: 'test123' };

  it('should register a new user', async () => {
    const res = await request.post('/api/auth/register').send(testUser);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
  });

  it('should reject duplicate email', async () => {
    const res = await request.post('/api/auth/register').send(testUser);
    expect(res.status).toBe(409);
  });

  it('should login with correct credentials', async () => {
    const res = await request.post('/api/auth/login').send(testUser);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('should reject invalid password', async () => {
    const res = await request.post('/api/auth/login').send({ email: testUser.email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('should reject missing fields', async () => {
    const res = await request.post('/api/auth/register').send({ email: 'bad' });
    expect(res.status).toBe(400);
  });
});
