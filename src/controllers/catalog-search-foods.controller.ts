import { Request, Response } from 'express';
import { config } from '../config';
import { CatalogSearchFoodsBody } from '../middleware/validate-catalog-search-body';
import { RedisCatalogProviderRepository } from '../catalog/infrastructure/redis/redis-catalog-provider.repository';
import { createSearchFoodCatalogService } from '../catalog/application/search-food-catalog.service';
import { logger } from '../logger';

const defaultCatalogSearchService = createSearchFoodCatalogService({
  provider: new RedisCatalogProviderRepository(),
  now: () => Date.now(),
});

export async function catalogSearchFoodsController(req: Request, res: Response): Promise<void> {
  if (!config.enableCatalogSearch) {
    res.status(503).json({
      error: 'catalog_disabled',
      message: 'Catalog search is disabled',
    });
    return;
  }

  const { lang, query, page, pageSize, region } = req.body as CatalogSearchFoodsBody;

  try {
    const response = await defaultCatalogSearchService({
      lang,
      query,
      page,
      pageSize,
      region,
    });
    res.status(200).json(response);
  } catch (error) {
    logger.error({ error }, 'Unexpected error during catalog food search');
    res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
}
