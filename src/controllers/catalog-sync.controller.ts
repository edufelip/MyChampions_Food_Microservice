import { Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../logger';
import { syncFoodCatalog } from '../catalog/application/sync-food-catalog.service';
import { CatalogSyncBody } from '../middleware/validate-catalog-sync-body';

export async function catalogSyncController(req: Request, res: Response): Promise<void> {
  if (!config.enableCatalogIngestion) {
    res.status(503).json({
      error: 'catalog_ingestion_disabled',
      message: 'Catalog ingestion is disabled',
    });
    return;
  }

  const body = (req.body ?? {}) as CatalogSyncBody;
  try {
    const result = await syncFoodCatalog({
      seedQueries: Array.isArray(body.seedQueries) ? body.seedQueries : undefined,
      region: typeof body.region === 'string' ? body.region : undefined,
      maxResultsPerQuery: typeof body.maxResultsPerQuery === 'number' ? body.maxResultsPerQuery : undefined,
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error({ error }, 'Unexpected error during catalog sync');
    res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
}
