import { Request, Response } from 'express';
import { createCatalogHealthService } from '../catalog/application/get-catalog-health.service';
import { RedisCatalogProviderRepository } from '../catalog/infrastructure/redis/redis-catalog-provider.repository';
import { logger } from '../logger';

const defaultCatalogHealthService = createCatalogHealthService(new RedisCatalogProviderRepository());

export async function catalogHealthController(_req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await defaultCatalogHealthService();
    res.status(200).json(snapshot);
  } catch (error) {
    logger.error({ error }, 'Unexpected error while reading catalog health');
    res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
}
