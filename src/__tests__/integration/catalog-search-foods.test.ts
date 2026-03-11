import request from 'supertest';
import { createApp } from '../../server';

jest.mock('../../auth/firebase-auth', () => ({
  verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-user-123' }),
}));

describe('Catalog endpoints', () => {
  const app = createApp();
  const VALID_AUTH = 'Bearer valid-firebase-token';

  it('returns 401 for unauthenticated catalog search request', async () => {
    const res = await request(app)
      .post('/catalog/searchFoods')
      .send({ lang: 'en', query: 'rice', page: 1, pageSize: 10 });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthenticated');
  });

  it('returns 400 when catalog search payload is invalid', async () => {
    const res = await request(app)
      .post('/catalog/searchFoods')
      .set('Authorization', VALID_AUTH)
      .send({ lang: 'de', query: 'rice', page: 1, pageSize: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
  });

  it('returns 200 for catalog search request', async () => {
    const res = await request(app)
      .post('/catalog/searchFoods')
      .set('Authorization', VALID_AUTH)
      .send({ lang: 'en', query: 'rice', page: 1, pageSize: 10 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('results');
    expect(res.body).toHaveProperty('meta');
  });

  it('returns 200 for catalog health', async () => {
    const res = await request(app).get('/catalog/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      enabled: true,
      ready: false,
      indexVersion: 'v1',
      documentCount: 0,
    });
  });
});
