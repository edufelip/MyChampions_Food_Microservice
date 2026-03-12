import { Request, Response } from 'express';
import { createCatalogHealthService } from '../catalog/application/get-catalog-health.service';
import { RedisCatalogProviderRepository } from '../catalog/infrastructure/redis/redis-catalog-provider.repository';
import { config } from '../config';
import { logger } from '../logger';

const defaultCatalogHealthService = createCatalogHealthService(new RedisCatalogProviderRepository());

export async function catalogHealthController(_req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await defaultCatalogHealthService();
    const maxAgeDays = config.catalogMaxAgeDays;
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const freshnessAtMs = snapshot.lastFreshnessAt ? Date.parse(snapshot.lastFreshnessAt) : Number.NaN;
    const freshnessAgeMs = Number.isFinite(freshnessAtMs) ? Math.max(0, Date.now() - freshnessAtMs) : null;
    const freshnessAgeDays = freshnessAgeMs === null ? null : Math.floor(freshnessAgeMs / (24 * 60 * 60 * 1000));
    const stale = freshnessAgeMs === null ? true : freshnessAgeMs > maxAgeMs;

    res.status(200).json({
      ...snapshot,
      stale,
      maxAgeDays,
      freshnessAgeDays,
    });
  } catch (error) {
    logger.error({ error }, 'Unexpected error while reading catalog health');
    res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
}
