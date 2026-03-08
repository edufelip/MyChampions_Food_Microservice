/**
 * Contract tests – verifies compatibility with mobile client expectations.
 *
 * Models the behaviour defined in features/nutrition/food-search-source.ts:
 *   - POST with Authorization: Bearer <token> and { query, maxResults }
 *   - 401/403 → unauthenticated path (client discards token)
 *   - Non-2xx  → client throws "Proxy returned error status: <status>"
 *   - 200      → { results: [...] } (results may be empty)
 *   - 200      → { error: "quota_exceeded" } handled specially
 */
import request from 'supertest';
import { createApp } from '../../server';

// Mock Firebase auth - always succeeds for contract tests
jest.mock('../../auth/firebase-auth', () => ({
  verifyIdToken: jest.fn().mockResolvedValue({ uid: 'contract-test-user' }),
}));

// Mock FatSecret search client
jest.mock('../../fatsecret/search-client', () => ({
  searchFoods: jest.fn(),
  FatSecretError: class FatSecretError extends Error {
    statusCode?: number;
    fatSecretCode?: string;
    constructor(message: string, statusCode?: number, fatSecretCode?: string) {
      super(message);
      this.name = 'FatSecretError';
      this.statusCode = statusCode;
      this.fatSecretCode = fatSecretCode;
    }
  },
}));

import { searchFoods } from '../../fatsecret/search-client';

const mockedSearchFoods = searchFoods as jest.MockedFunction<typeof searchFoods>;

describe('Contract: mobile client compatibility', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * CONTRACT: Successful search returns { results: [...] } with HTTP 200.
   * Results array contains raw food item objects.
   */
  it('C1: 200 response has { results: [...] } shape', async () => {
    const mockFoods = [
      { food_id: '1', food_name: 'Banana', food_url: 'https://fatsecret.com/calories-nutrition/generic/banana' },
    ];
    mockedSearchFoods.mockResolvedValue(mockFoods);

    const res = await request(app)
      .post('/searchFoods')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: 'banana', maxResults: 5 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('results');
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results[0]).toHaveProperty('food_id');
  });

  /**
   * CONTRACT: Empty results are allowed – { results: [] } is valid.
   */
  it('C2: 200 response with empty results array is valid', async () => {
    mockedSearchFoods.mockResolvedValue([]);

    const res = await request(app)
      .post('/searchFoods')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: 'xyzzy-nonexistent', maxResults: 10 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [] });
  });

  /**
   * CONTRACT: Missing/invalid auth → 401 (client discards cached token and re-authenticates).
   */
  it('C3: Missing auth header → 401', async () => {
    const res = await request(app)
      .post('/searchFoods')
      .send({ query: 'chicken', maxResults: 10 });

    expect(res.status).toBe(401);
  });

  /**
   * CONTRACT: Non-2xx responses cause client to throw "Proxy returned error status: <status>".
   * Verify 400 and 500 remain non-2xx.
   */
  it('C4: 400 from validation is non-2xx with JSON error body', async () => {
    const res = await request(app)
      .post('/searchFoods')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: '', maxResults: 10 });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).toHaveProperty('error');
  });

  it('C5: Quota response returns 200 + { error: quota_exceeded }', async () => {
    const { FatSecretError } = jest.requireMock('../../fatsecret/search-client') as {
      FatSecretError: new (msg: string, code?: number, fsCode?: string) => Error & { fatSecretCode?: string };
    };
    mockedSearchFoods.mockRejectedValue(new FatSecretError('quota', 403, 'quota_exceeded'));

    const res = await request(app)
      .post('/searchFoods')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: 'chicken', maxResults: 10 });

    expect(res.status).toBe(200);
    expect(res.body.error).toBe('quota_exceeded');
  });

  it('C6: 500 internal error is non-2xx, body has no secrets', async () => {
    mockedSearchFoods.mockRejectedValue(new Error('secret DB password xyz'));

    const res = await request(app)
      .post('/searchFoods')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: 'chicken', maxResults: 10 });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret DB password xyz');
  });

  /**
   * CONTRACT: Content-Type must be application/json.
   */
  it('C7: Content-Type application/json is required for POST', async () => {
    mockedSearchFoods.mockResolvedValue([]);

    const res = await request(app)
      .post('/searchFoods')
      .set('Authorization', 'Bearer valid-token')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ query: 'chicken', maxResults: 5 }));

    expect(res.status).toBe(200);
  });
});
