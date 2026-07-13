/**
 * Integration tests – POST /searchFoods with mocked FatSecret responses.
 *
 * The MyChampions auth module and FatSecret search client are mocked so tests
 * run without external dependencies.
 */
import request from 'supertest';
import { createApp } from '../../server';

jest.mock('../../auth/mychampions-auth', () => ({
  MyChampionsAuthError: class MyChampionsAuthError extends Error {
    constructor(public readonly code: 'unauthenticated' | 'unavailable', message = code) {
      super(message);
    }
  },
  verifyMyChampionsAccessToken: jest.fn().mockResolvedValue({ uid: 'test-user-123' }),
}));

// Mock unified search service
jest.mock('../../services/unified-search.service', () => ({
  unifiedSearchFoods: jest.fn(),
}));

// Keep FatSecretError class contract for controller error mapping
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

import { unifiedSearchFoods } from '../../services/unified-search.service';
import { FatSecretError } from '../../fatsecret/search-client';

const mockedUnifiedSearchFoods = unifiedSearchFoods as jest.MockedFunction<typeof unifiedSearchFoods>;

const VALID_AUTH = 'Bearer valid-mychampions-token';
const VALID_BODY = { query: 'chicken', maxResults: 10, region: 'US', language: 'en' };

const MOCK_FOOD_ITEMS = [
  { id: '33891', name: 'Chicken Breast', carbohydrate: 0, protein: 31, fat: 3.6, serving: 100 },
  { id: '33892', name: 'Grilled Chicken', carbohydrate: 0, protein: 29, fat: 4.1, serving: 100 },
];

describe('POST /searchFoods', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockSearchResolved(results: unknown): void {
    mockedUnifiedSearchFoods.mockResolvedValue({ results } as never);
  }

  function mockSearchRejected(error: unknown): void {
    mockedUnifiedSearchFoods.mockRejectedValue(error);
  }

  describe('Happy path', () => {
    it('returns 200 with results array', async () => {
      mockSearchResolved(MOCK_FOOD_ITEMS);

      const res = await request(app)
        .post('/searchFoods')
        .set('Authorization', VALID_AUTH)
        .send(VALID_BODY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('results');
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0]).toMatchObject({ id: '33891' });
    });

    it('returns 200 with empty results when no foods found', async () => {
      mockSearchResolved([]);

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
      const { MyChampionsAuthError, verifyMyChampionsAccessToken } = jest.requireMock('../../auth/mychampions-auth') as {
        MyChampionsAuthError: new (
          code: 'unauthenticated' | 'unavailable',
          message?: string,
        ) => Error;
        verifyMyChampionsAccessToken: jest.Mock;
      };
      verifyMyChampionsAccessToken.mockRejectedValueOnce(
        new MyChampionsAuthError('unauthenticated', 'Invalid token'),
      );

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
        .send({ maxResults: 10, region: 'US', language: 'en' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('bad_request');
    });

    it('returns 400 when maxResults is not a positive integer', async () => {
      const res = await request(app)
        .post('/searchFoods')
        .set('Authorization', VALID_AUTH)
        .send({ query: 'chicken', maxResults: -1, region: 'US', language: 'en' });

      expect(res.status).toBe(400);
    });
  });

  describe('Error mapping', () => {
    it('returns 200 + quota_exceeded body on quota exceeded (client compatibility)', async () => {
      mockSearchRejected(
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
      mockSearchRejected(
        new FatSecretError('Bad request', 400, 'bad_request'),
      );

      const res = await request(app)
        .post('/searchFoods')
        .set('Authorization', VALID_AUTH)
        .send(VALID_BODY);

      expect(res.status).toBe(400);
    });

    it('returns 502 when FatSecret IP is not allowlisted', async () => {
      mockSearchRejected(
        new FatSecretError('upstream_ip_not_allowlisted', 502, 'upstream_ip_not_allowlisted'),
      );

      const res = await request(app)
        .post('/searchFoods')
        .set('Authorization', VALID_AUTH)
        .send(VALID_BODY);

      expect(res.status).toBe(502);
      expect(res.body).toEqual({
        error: 'upstream_ip_not_allowlisted',
        message: 'Food provider IP allowlist mismatch',
      });
    });

    it('returns 500 on unexpected error', async () => {
      mockSearchRejected(new Error('Network failure'));

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

    it('returns 200 with counters object on /metrics', async () => {
      const res = await request(app).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('counters');
      expect(typeof res.body.counters).toBe('object');
    });
  });

  describe('Method routing', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app).get('/unknown');
      expect(res.status).toBe(404);
    });
  });
});
