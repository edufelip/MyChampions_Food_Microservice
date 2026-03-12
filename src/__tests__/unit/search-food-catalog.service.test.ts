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
});
