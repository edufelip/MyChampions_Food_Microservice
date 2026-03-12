import { createSearchFoodCatalogService } from '../../catalog/application/search-food-catalog.service';
import { getCounter, resetCounters } from '../../metrics';

describe('search-food-catalog.service', () => {
  beforeEach(() => {
    resetCounters();
  });

  it('uses prefix search for non-empty query and records served ids', async () => {
    const provider = {
      searchByPrefix: jest.fn().mockResolvedValue({
        total: 1,
        items: [{ id: '1', name: 'Rice', carbohydrate: 28, protein: 2.7, fat: 0.3, serving: 100 }],
      }),
      getPopular: jest.fn(),
      getHealth: jest.fn().mockResolvedValue({
        enabled: true,
        ready: true,
        indexVersion: 'v1',
        documentCount: 500,
        lastFreshnessAt: '2026-03-11T00:00:00.000Z',
      }),
      recordServed: jest.fn().mockResolvedValue(undefined),
      recordClicked: jest.fn(),
    };

    const service = createSearchFoodCatalogService({
      provider,
      now: () => 1000,
    });

    const response = await service({
      lang: 'en',
      query: 'rice',
      page: 1,
      pageSize: 10,
      region: 'US',
    });

    expect(provider.searchByPrefix).toHaveBeenCalledTimes(1);
    expect(provider.recordServed).toHaveBeenCalledWith({
      lang: 'en',
      region: 'US',
      foodIds: ['1'],
    });
    expect(response.total).toBe(1);
    expect(getCounter('catalog.search_not_ready')).toBe(0);
    expect(getCounter('catalog.empty_response')).toBe(0);
  });

  it('increments not-ready and empty counters when catalog has no indexed docs', async () => {
    const provider = {
      searchByPrefix: jest.fn().mockResolvedValue({
        total: 0,
        items: [],
      }),
      getPopular: jest.fn(),
      getHealth: jest.fn().mockResolvedValue({
        enabled: true,
        ready: false,
        indexVersion: 'v1',
        documentCount: 0,
        lastFreshnessAt: null,
      }),
      recordServed: jest.fn().mockResolvedValue(undefined),
      recordClicked: jest.fn(),
    };

    const service = createSearchFoodCatalogService({
      provider,
      now: () => 1000,
    });

    const response = await service({
      lang: 'pt',
      query: 'BATATA',
      page: 1,
      pageSize: 20,
      region: 'br',
    });

    expect(response.total).toBe(0);
    expect(provider.searchByPrefix).toHaveBeenCalledTimes(1);
    expect(getCounter('catalog.search_not_ready')).toBe(1);
    expect(getCounter('catalog.search_not_ready.lang.pt')).toBe(1);
    expect(getCounter('catalog.search_not_ready.region.br')).toBe(1);
    expect(getCounter('catalog.empty_response')).toBe(1);
    expect(getCounter('catalog.empty_response.lang.pt')).toBe(1);
    expect(getCounter('catalog.empty_response.region.br')).toBe(1);
  });

  it('rewrites pt alias queries before searching', async () => {
    const provider = {
      searchByPrefix: jest.fn().mockResolvedValue({
        total: 1,
        items: [{ id: '9', name: 'Patinho Magro', carbohydrate: 0, protein: 26, fat: 7, serving: 100 }],
      }),
      getPopular: jest.fn(),
      getHealth: jest.fn().mockResolvedValue({
        enabled: true,
        ready: true,
        indexVersion: 'v1',
        documentCount: 500,
        lastFreshnessAt: '2026-03-11T00:00:00.000Z',
      }),
      recordServed: jest.fn().mockResolvedValue(undefined),
      recordClicked: jest.fn(),
    };

    const service = createSearchFoodCatalogService({
      provider,
      now: () => 1000,
    });

    const response = await service({
      lang: 'pt',
      query: 'Patinho',
      page: 1,
      pageSize: 20,
      region: 'br',
    });

    expect(provider.searchByPrefix).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedQuery: 'lean ground beef',
      }),
    );
    expect(response.meta).toMatchObject({
      normalizedQuery: 'lean ground beef',
      rewriteApplied: true,
      rewrittenFrom: 'patinho',
    });
    expect(getCounter('catalog.query_rewrite')).toBe(1);
    expect(getCounter('catalog.query_rewrite.lang.pt')).toBe(1);
  });

  it('tries fallback alias candidates until finding results', async () => {
    const provider = {
      searchByPrefix: jest
        .fn()
        .mockResolvedValueOnce({
          total: 0,
          items: [],
        })
        .mockResolvedValueOnce({
          total: 1,
          items: [{ id: '2', name: 'Ground Beef', carbohydrate: 0, protein: 26, fat: 10, serving: 100 }],
        }),
      getPopular: jest.fn(),
      getHealth: jest.fn().mockResolvedValue({
        enabled: true,
        ready: true,
        indexVersion: 'v1',
        documentCount: 500,
        lastFreshnessAt: '2026-03-11T00:00:00.000Z',
      }),
      recordServed: jest.fn().mockResolvedValue(undefined),
      recordClicked: jest.fn(),
    };

    const service = createSearchFoodCatalogService({
      provider,
      now: () => 1000,
    });

    const response = await service({
      lang: 'pt',
      query: 'patinho',
      page: 1,
      pageSize: 20,
      region: 'br',
    });

    expect(provider.searchByPrefix).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ normalizedQuery: 'lean ground beef' }),
    );
    expect(provider.searchByPrefix).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ normalizedQuery: 'ground beef' }),
    );
    expect(response.total).toBe(1);
    expect(response.meta.normalizedQuery).toBe('ground beef');
    expect(getCounter('catalog.empty_response')).toBe(0);
  });
});
