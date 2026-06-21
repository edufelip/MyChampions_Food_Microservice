import { createUnifiedSearchFoodsService } from '../../../src/services/unified-search.service';
import { Translator } from '../../../src/translation/translator';

describe('unifiedSearchFoods', () => {
  it('returns catalog results if catalog has hits', async () => {
    const mockCatalogSearchService = jest.fn().mockResolvedValue({
      total: 1,
      results: [{ id: '1', name: 'Catalog Food' }],
      meta: { normalizedQuery: 'cat' },
    });
    const mockSearchFoodsClient = jest.fn();
    
    const service = createUnifiedSearchFoodsService({
      catalogSearchService: mockCatalogSearchService,
      translator: {} as Translator,
      cacheRepo: {} as any,
      searchFoodsClient: mockSearchFoodsClient,
      autoIngestCatalogClient: jest.fn(),
    });

    const response = await service('query', 10, 'US', 'en', 1);

    expect(response.source).toBe('catalog');
    expect(response.total).toBe(1);
    expect(response.results).toEqual([{ id: '1', name: 'Catalog Food' }]);
    expect(mockCatalogSearchService).toHaveBeenCalled();
    expect(mockSearchFoodsClient).not.toHaveBeenCalled();
  });

  it('falls back to fatsecret if catalog is empty and auto-ingests', async () => {
    const mockCatalogSearchService = jest.fn().mockResolvedValue({
      total: 0,
      results: [],
      meta: { normalizedQuery: 'cat' },
    });
    const mockSearchFoodsClient = jest.fn().mockResolvedValue([
      { id: '2', name: 'FatSecret Food' },
    ]);
    const mockAutoIngestCatalogClient = jest.fn().mockResolvedValue(undefined);

    const service = createUnifiedSearchFoodsService({
      catalogSearchService: mockCatalogSearchService,
      translator: {} as Translator,
      cacheRepo: {} as any,
      searchFoodsClient: mockSearchFoodsClient,
      autoIngestCatalogClient: mockAutoIngestCatalogClient,
    });

    const response = await service('query', 10, 'US', 'en', 1);

    expect(response.source).toBe('fatsecret');
    expect(response.total).toBe(1);
    expect(response.results).toEqual([{ id: '2', name: 'FatSecret Food' }]);
    expect(mockSearchFoodsClient).toHaveBeenCalledWith('query', 10, 'US', 'en');
    expect(mockAutoIngestCatalogClient).toHaveBeenCalled();
  });
});
