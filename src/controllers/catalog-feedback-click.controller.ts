import { Request, Response } from 'express';
import { config } from '../config';
import { RedisCatalogProviderRepository } from '../catalog/infrastructure/redis/redis-catalog-provider.repository';
import { CatalogClickBody } from '../middleware/validate-catalog-click-body';
import { logger } from '../logger';

const provider = new RedisCatalogProviderRepository();

export async function catalogFeedbackClickController(req: Request, res: Response): Promise<void> {
  if (!config.enableCatalogSearch) {
    res.status(503).json({
      error: 'catalog_disabled',
      message: 'Catalog search is disabled',
    });
    return;
  }

  const { lang, foodId, region } = req.body as CatalogClickBody;
  try {
    await provider.recordClicked({ lang, foodId, region });
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error({ error }, 'Unexpected error while recording catalog click feedback');
    res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
}
