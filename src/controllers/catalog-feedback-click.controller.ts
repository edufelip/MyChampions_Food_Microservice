import { Request, Response } from 'express';
import { RedisCatalogProviderRepository } from '../catalog/infrastructure/redis/redis-catalog-provider.repository';
import { CatalogClickBody } from '../middleware/validate-catalog-click-body';
import { logger } from '../logger';

const provider = new RedisCatalogProviderRepository();

export async function catalogFeedbackClickController(req: Request, res: Response): Promise<void> {
  const { lang, foodId, region } = req.body as CatalogClickBody;
  try {
    await provider.recordClicked({ lang, foodId, region });
  } catch (error) {
    logger.warn({ error }, 'Failed to record clicked catalog item');
  }
  res.status(200).json({ ok: true });
}
