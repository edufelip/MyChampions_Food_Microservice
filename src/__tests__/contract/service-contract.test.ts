import request from 'supertest';

jest.mock('../../auth/mychampions-auth', () => ({
  MyChampionsAuthError: class MyChampionsAuthError extends Error {
    constructor(public readonly code: 'unauthenticated' | 'unavailable') {
      super(code);
    }
  },
  verifyMyChampionsAccessToken: jest.fn().mockResolvedValue({ uid: 'contract-user' }),
}));

jest.mock('../../services/unified-search.service', () => ({
  unifiedSearchFoods: jest.fn(),
}));

import { createApp } from '../../server';
import { unifiedSearchFoods } from '../../services/unified-search.service';

const mockedUnifiedSearchFoods = unifiedSearchFoods as jest.MockedFunction<typeof unifiedSearchFoods>;
const app = createApp();

describe('food service consumer contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the unauthenticated search failure shape stable', async () => {
    const response = await request(app)
      .post('/searchFoods')
      .send({ query: 'chicken', maxResults: 5 });

    expect(response.status).toBe(401);
    expect(response.body).toEqual(
      expect.objectContaining({ error: 'unauthenticated' }),
    );
    expect(mockedUnifiedSearchFoods).not.toHaveBeenCalled();
  });

  it('keeps the authenticated search response compatible with the mobile client', async () => {
    mockedUnifiedSearchFoods.mockResolvedValue({ results: [] } as never);

    const response = await request(app)
      .post('/searchFoods')
      .set('Authorization', 'Bearer contract-token')
      .send({ query: 'chicken', maxResults: 5, region: 'US', language: 'en' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ results: [] });
    expect(JSON.stringify(response.body)).not.toContain('FATSECRET_CLIENT_SECRET');
  });

  it('keeps the health response service-owned and secret-free', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({ status: 'ok', service: 'food-microservice' }),
    );
    expect(JSON.stringify(response.body)).not.toMatch(/secret|token|password/i);
  });
});
