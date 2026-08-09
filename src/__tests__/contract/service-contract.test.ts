import request from 'supertest';

jest.mock('../../auth/mychampions-auth', () => {
  class MyChampionsAuthError extends Error {
    constructor(public readonly code: 'unauthenticated' | 'unavailable', message: string = code) {
      super(message);
      this.name = 'MyChampionsAuthError';
    }
  }

  return {
    MyChampionsAuthError,
    verifyMyChampionsAccessToken: jest.fn((token: string) => {
      if (token === 'invalid-token') {
        return Promise.reject(new MyChampionsAuthError('unauthenticated', 'Invalid token'));
      }
      if (token === 'unavailable-token') {
        return Promise.reject(new MyChampionsAuthError('unavailable', 'Auth service unavailable'));
      }
      return Promise.resolve({ uid: 'contract-user' });
    }),
  };
});

jest.mock('../../fatsecret/search-client', () => {
  class FatSecretError extends Error {
    constructor(
      message: string,
      public readonly statusCode?: number,
      public readonly fatSecretCode?: string,
    ) {
      super(message);
      this.name = 'FatSecretError';
    }
  }

  return {
    FatSecretError,
    searchFoods: jest.fn(),
  };
});

jest.mock('../../catalog/application/search-food-catalog.service', () => ({
  createSearchFoodCatalogService: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../../catalog/application/auto-ingest-catalog.service', () => ({
  autoIngestCatalog: jest.fn().mockResolvedValue(undefined),
}));

import { createApp } from '../../server';
import { autoIngestCatalog } from '../../catalog/application/auto-ingest-catalog.service';
import { CatalogSearchResponse } from '../../catalog/domain/catalog-models';
import { searchFoods, FatSecretError } from '../../fatsecret/search-client';
import { createSearchFoodCatalogService } from '../../catalog/application/search-food-catalog.service';

const mockedSearchFoods = searchFoods as jest.MockedFunction<typeof searchFoods>;
const mockedAutoIngestCatalog = autoIngestCatalog as jest.MockedFunction<typeof autoIngestCatalog>;
const mockedCreateSearchFoodCatalogService = createSearchFoodCatalogService as jest.Mock;
const mockedCatalogSearchService = mockedCreateSearchFoodCatalogService.mock.results[0]?.value as jest.Mock;
const app = createApp();

const VALID_BODY = { query: 'chicken', maxResults: 5, region: 'US', language: 'en' };
const FOOD_ITEM = {
  id: 'contract-food',
  name: 'Chicken Breast',
  carbohydrate: 0,
  protein: 31,
  fat: 3.6,
  serving: 100,
} as const;

function catalogResponse(overrides: Partial<CatalogSearchResponse> = {}): CatalogSearchResponse {
  return {
    page: 1,
    pageSize: 5,
    total: 0,
    results: [],
    meta: {
      lang: 'en',
      normalizedQuery: 'chicken',
      rewriteApplied: false,
      tookMs: 0,
    },
    ...overrides,
  };
}

describe('food service consumer contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCatalogSearchService.mockReset();
    mockedSearchFoods.mockReset();
    mockedAutoIngestCatalog.mockReset();
    mockedCatalogSearchService.mockResolvedValue(catalogResponse());
    mockedAutoIngestCatalog.mockResolvedValue(undefined);
  });

  it('keeps missing and invalid authentication failures out of the search service', async () => {
    const missing = await request(app).post('/searchFoods').send(VALID_BODY);
    const invalid = await request(app)
      .post('/searchFoods')
      .set('Authorization', 'Bearer invalid-token')
      .send(VALID_BODY);

    expect(missing.status).toBe(401);
    expect(missing.body).toEqual(
      expect.objectContaining({ error: 'unauthenticated' }),
    );
    expect(invalid.status).toBe(401);
    expect(invalid.body).toEqual(
      expect.objectContaining({ error: 'unauthenticated' }),
    );
    expect(mockedCatalogSearchService).not.toHaveBeenCalled();
    expect(mockedSearchFoods).not.toHaveBeenCalled();
  });

  it('maps an unavailable auth authority to 503 without invoking search', async () => {
    const response = await request(app)
      .post('/searchFoods')
      .set('Authorization', 'Bearer unavailable-token')
      .send(VALID_BODY);

    expect(response.status).toBe(503);
    expect(response.body).toEqual(
      expect.objectContaining({ error: 'auth_unavailable' }),
    );
    expect(mockedCatalogSearchService).not.toHaveBeenCalled();
    expect(mockedSearchFoods).not.toHaveBeenCalled();
  });

  it('keeps the authenticated fallback envelope and normalized provider arguments compatible', async () => {
    mockedSearchFoods.mockResolvedValue([FOOD_ITEM]);

    const response = await request(app)
      .post('/searchFoods')
      .set('Authorization', 'Bearer contract-token')
      .send(VALID_BODY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      results: [FOOD_ITEM],
      meta: {
        lang: 'en',
        normalizedQuery: 'chicken',
        rewriteApplied: false,
        tookMs: 0,
      },
      total: 1,
      page: 1,
      pageSize: 5,
      source: 'fatsecret',
    });
    expect(mockedSearchFoods).toHaveBeenCalledWith('chicken', 5, 'US', 'en');
    expect(mockedAutoIngestCatalog).toHaveBeenCalledWith([FOOD_ITEM], 'US');
    expect(JSON.stringify(response.body)).not.toContain('FATSECRET_CLIENT_SECRET');
  });

  it('preserves populated catalog results before the provider fallback', async () => {
    mockedCatalogSearchService.mockResolvedValue(
      catalogResponse({
        total: 1,
        results: [FOOD_ITEM],
      }),
    );

    const response = await request(app)
      .post('/searchFoods')
      .set('Authorization', 'Bearer contract-token')
      .send(VALID_BODY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      results: [FOOD_ITEM],
      meta: {
        lang: 'en',
        normalizedQuery: 'chicken',
        rewriteApplied: false,
        tookMs: 0,
      },
      total: 1,
      page: 1,
      pageSize: 5,
      source: 'catalog',
    });
    expect(mockedSearchFoods).not.toHaveBeenCalled();
    expect(mockedAutoIngestCatalog).not.toHaveBeenCalled();
  });

  it('maps provider errors to a safe response without exposing a secret sentinel', async () => {
    mockedSearchFoods.mockRejectedValue(
      new FatSecretError(
        'FATSECRET_CLIENT_SECRET=contract-secret',
        502,
        'upstream_error',
      ),
    );

    const response = await request(app)
      .post('/searchFoods')
      .set('Authorization', 'Bearer contract-token')
      .send(VALID_BODY);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: 'upstream_error',
      message: 'Food provider unavailable',
    });
    expect(JSON.stringify(response.body)).not.toContain('contract-secret');
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
