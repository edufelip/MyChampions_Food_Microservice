import { Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../logger';
import { RedisCatalogIngestionRepository } from '../catalog/infrastructure/redis/redis-catalog-ingestion.repository';
import { CatalogLocalizationReviewBody } from '../middleware/validate-catalog-localization-review-body';

const localizationRepository = new RedisCatalogIngestionRepository();

export async function catalogLocalizationReviewController(req: Request, res: Response): Promise<void> {
  if (!config.enableCatalogIngestion) {
    res.status(503).json({
      error: 'catalog_ingestion_disabled',
      message: 'Catalog ingestion is disabled',
    });
    return;
  }

  const body = req.body as CatalogLocalizationReviewBody;
  try {
    await localizationRepository.markLocalizedStatus({
      foodId: body.foodId,
      lang: body.lang,
      status: body.status,
      reviewerId: body.reviewerId,
      localizedName: body.localizedName,
    });
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error({ error }, 'Unexpected error while updating catalog localization review status');
    res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
}
