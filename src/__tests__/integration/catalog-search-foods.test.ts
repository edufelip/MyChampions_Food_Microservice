import request from 'supertest';
import { createApp } from '../../server';
import { searchFoods } from '../../fatsecret/search-client';

jest.mock('../../auth/firebase-auth', () => ({
  verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-user-123' }),
}));
jest.mock('../../fatsecret/search-client', () => ({
  searchFoods: jest.fn().mockResolvedValue([
    { id: '9001', name: 'Legacy English Food', carbohydrate: 10, protein: 20, fat: 5, serving: 100 },
  ]),
}));

describe('Catalog endpoints', () => {
  const app = createApp();
  const VALID_AUTH = 'Bearer valid-firebase-token';
  const mockedSearchFoods = searchFoods as jest.MockedFunction<typeof searchFoods>;

  beforeEach(() => {
    mockedSearchFoods.mockClear();
  });

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

  it('falls back to legacy search only when payload mentions english and catalog is empty', async () => {
    const res = await request(app)
      .post('/catalog/searchFoods')
      .set('Authorization', VALID_AUTH)
      .send({
        lang: 'pt',
        query: 'unknown-food',
        page: 1,
        pageSize: 10,
        region: 'br',
        note: 'use english fallback if needed',
      });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({
      id: '9001',
      name: 'Legacy English Food',
    });
    expect(mockedSearchFoods).toHaveBeenCalledTimes(1);
  });

  it('does not fall back when payload does not mention english', async () => {
    const res = await request(app)
      .post('/catalog/searchFoods')
      .set('Authorization', VALID_AUTH)
      .send({
        lang: 'pt',
        query: 'unknown-food',
        page: 1,
        pageSize: 10,
        region: 'br',
      });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.results).toEqual([]);
    expect(mockedSearchFoods).not.toHaveBeenCalled();
  });

  it('uses rewritten normalized query for legacy fallback search', async () => {
    const res = await request(app)
      .post('/catalog/searchFoods')
      .set('Authorization', VALID_AUTH)
      .send({
        lang: 'pt',
        query: 'patinho',
        page: 1,
        pageSize: 10,
        note: 'english please',
      });

    expect(res.status).toBe(200);
    expect(mockedSearchFoods).toHaveBeenCalledTimes(1);
    expect(mockedSearchFoods).toHaveBeenCalledWith(
      'lean ground beef',
      10,
      'US',
      'en',
    );
  });

  it('returns 200 for catalog health', async () => {
    const res = await request(app).get('/catalog/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      enabled: true,
      ready: false,
      indexVersion: 'v1',
      documentCount: 0,
      stale: true,
      maxAgeDays: 180,
      freshnessAgeDays: null,
    });
  });
});
