import { Request, Response } from 'express';
import { CatalogSearchFoodsBody } from '../middleware/validate-catalog-search-body';
import { RedisCatalogProviderRepository } from '../catalog/infrastructure/redis/redis-catalog-provider.repository';
import { createSearchFoodCatalogService } from '../catalog/application/search-food-catalog.service';
import { logger } from '../logger';
import { config } from '../config';
import { searchFoods } from '../fatsecret/search-client';

const defaultCatalogSearchService = createSearchFoodCatalogService({
  provider: new RedisCatalogProviderRepository(),
  now: () => Date.now(),
});

export async function catalogSearchFoodsController(req: Request, res: Response): Promise<void> {
  const { lang, query, page, pageSize, region, mentionsEnglish } = req.body as CatalogSearchFoodsBody;

  try {
    let response = await defaultCatalogSearchService({
      lang,
      query,
      page,
      pageSize,
      region,
    });

    if (response.total === 0 && mentionsEnglish) {
      const maxResults = Math.min(page * pageSize, config.maxResultsLimit);
      const legacyResults = await searchFoods(
        response.meta.normalizedQuery,
        maxResults,
        (region?.trim() || 'US').toUpperCase(),
        'en',
      );

      const start = (page - 1) * pageSize;
      response = {
        page,
        pageSize,
        total: legacyResults.length,
        results: legacyResults.slice(start, start + pageSize),
        meta: response.meta,
      };
    }

    res.status(200).json(response);
  } catch (error) {
    logger.error({ error }, 'Unexpected error during catalog food search');
    res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
}
