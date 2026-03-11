import { createSearchFoodCatalogService } from '../../catalog/application/search-food-catalog.service';

describe('search-food-catalog.service', () => {
  it('uses prefix search for non-empty query and records served ids', async () => {
    const provider = {
      searchByPrefix: jest.fn().mockResolvedValue({
        total: 1,
        items: [{ id: '1', name: 'Rice', carbohydrate: 28, protein: 2.7, fat: 0.3, serving: 100 }],
      }),
      getPopular: jest.fn(),
      getHealth: jest.fn(),
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
  });
});
