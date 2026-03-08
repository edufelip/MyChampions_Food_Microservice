/**
 * Integration tests – POST /searchFoods with mocked FatSecret responses.
 *
 * The Firebase auth module and FatSecret search client are mocked so tests
 * run without external dependencies.
 */
import request from 'supertest';
import { createApp } from '../../server';

// Mock Firebase auth
jest.mock('../../auth/firebase-auth', () => ({
  verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-user-123' }),
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
import { FatSecretError } from '../../fatsecret/search-client';

const mockedSearchFoods = searchFoods as jest.MockedFunction<typeof searchFoods>;

const VALID_AUTH = 'Bearer valid-firebase-token';
const VALID_BODY = { query: 'chicken', maxResults: 10 };

const MOCK_FOOD_ITEMS = [
  { food_id: '33891', food_name: 'Chicken Breast', food_type: 'Generic' },
  { food_id: '33892', food_name: 'Grilled Chicken', food_type: 'Generic' },
];

describe('POST /searchFoods', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy path', () => {
    it('returns 200 with results array', async () => {
      mockedSearchFoods.mockResolvedValue(MOCK_FOOD_ITEMS);

      const res = await request(app)
        .post('/searchFoods')
        .set('Authorization', VALID_AUTH)
        .send(VALID_BODY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('results');
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0]).toMatchObject({ food_id: '33891' });
    });

    it('returns 200 with empty results when no foods found', async () => {
      mockedSearchFoods.mockResolvedValue([]);

      const res = await request(app)
        .post('/searchFoods')
        .set('Authorization', VALID_AUTH)
        .send(VALID_BODY);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ results: [] });
    });
  });

  describe('Authentication', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app)
        .post('/searchFoods')
        .send(VALID_BODY);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthenticated');
    });

    it('returns 401 when token is invalid', async () => {
      const { verifyIdToken } = jest.requireMock('../../auth/firebase-auth') as {
        verifyIdToken: jest.Mock;
      };
      verifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));

      const res = await request(app)
        .post('/searchFoods')
        .set('Authorization', 'Bearer bad-token')
        .send(VALID_BODY);

      expect(res.status).toBe(401);
    });
  });

  describe('Input validation', () => {
    it('returns 400 when query is missing', async () => {
      const res = await request(app)
        .post('/searchFoods')
        .set('Authorization', VALID_AUTH)
        .send({ maxResults: 10 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('bad_request');
    });

    it('returns 400 when maxResults is not a positive integer', async () => {
      const res = await request(app)
        .post('/searchFoods')
        .set('Authorization', VALID_AUTH)
        .send({ query: 'chicken', maxResults: -1 });

      expect(res.status).toBe(400);
    });
  });

  describe('Error mapping', () => {
    it('returns 200 + quota_exceeded body on quota exceeded (client compatibility)', async () => {
      mockedSearchFoods.mockRejectedValue(
        new FatSecretError('quota_exceeded', 403, 'quota_exceeded'),
      );

      const res = await request(app)
        .post('/searchFoods')
        .set('Authorization', VALID_AUTH)
        .send(VALID_BODY);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ error: 'quota_exceeded' });
    });

    it('returns 400 on FatSecret bad_request error', async () => {
      mockedSearchFoods.mockRejectedValue(
        new FatSecretError('Bad request', 400, 'bad_request'),
      );

      const res = await request(app)
        .post('/searchFoods')
        .set('Authorization', VALID_AUTH)
        .send(VALID_BODY);

      expect(res.status).toBe(400);
    });

    it('returns 500 on unexpected error', async () => {
      mockedSearchFoods.mockRejectedValue(new Error('Network failure'));

      const res = await request(app)
        .post('/searchFoods')
        .set('Authorization', VALID_AUTH)
        .send(VALID_BODY);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('internal_error');
      // Must not expose internal details
      expect(JSON.stringify(res.body)).not.toContain('Network failure');
    });
  });

  describe('Health endpoint', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('food-microservice');
    });
  });

  describe('Method routing', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app).get('/unknown');
      expect(res.status).toBe(404);
    });
  });
});
