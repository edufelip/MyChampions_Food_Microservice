import request from 'supertest';
import { createApp } from '../../server';

jest.mock('../../auth/mychampions-auth', () => ({
  MyChampionsAuthError: class MyChampionsAuthError extends Error {},
  verifyMyChampionsAccessToken: jest.fn().mockResolvedValue({ uid: 'test-user-123' }),
}));

describe('POST /catalog/feedback/click', () => {
  const app = createApp();
  const VALID_AUTH = 'Bearer valid-mychampions-token';

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/catalog/feedback/click').send({ lang: 'en', foodId: '1' });
    expect(res.status).toBe(401);
  });

  it('returns 400 with invalid payload', async () => {
    const res = await request(app)
      .post('/catalog/feedback/click')
      .set('Authorization', VALID_AUTH)
      .send({ lang: 'de', foodId: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
  });

  it('returns 200 with valid payload', async () => {
    const res = await request(app)
      .post('/catalog/feedback/click')
      .set('Authorization', VALID_AUTH)
      .send({ lang: 'en', foodId: '1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
