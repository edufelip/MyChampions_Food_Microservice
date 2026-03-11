/**
 * Express application factory.
 *
 * Wires together middleware, routes, and error handlers. Exported as a
 * factory function so integration tests can create a fresh instance.
 */
import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './logger';
import { authGuard } from './middleware/auth-guard';
import { validateSearchFoodsBody } from './middleware/request-validator';
import { searchFoodsController } from './controllers/search-foods.controller';
import { getAllCounters } from './metrics';
import { validateCatalogSearchBody } from './middleware/validate-catalog-search-body';
import { catalogSearchFoodsController } from './controllers/catalog-search-foods.controller';
import { catalogHealthController } from './controllers/catalog-health.controller';
import { catalogSyncController } from './controllers/catalog-sync.controller';
import { validateCatalogClickBody } from './middleware/validate-catalog-click-body';
import { catalogFeedbackClickController } from './controllers/catalog-feedback-click.controller';
import { requireCatalogAdmin } from './middleware/require-catalog-admin';
import { validateCatalogSyncBody } from './middleware/validate-catalog-sync-body';
import { validateCatalogLocalizationReviewBody } from './middleware/validate-catalog-localization-review-body';
import { catalogLocalizationReviewController } from './controllers/catalog-localization-review.controller';

export function createApp(): express.Application {
  const app = express();
  app.set('trust proxy', config.trustProxyHops);

  // ─── Middleware ────────────────────────────────────────────────────────────

  app.use(express.json({ limit: '10kb' }));

  // Request logger
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info({ method: req.method, url: req.url, ip: req.ip }, 'Incoming request');
    next();
  });

  // Rate limiting (per IP)
  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'too_many_requests', message: 'Rate limit exceeded. Please slow down.' },
    }),
  );

  // ─── Routes ────────────────────────────────────────────────────────────────

  /** Health check – no auth required */
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'food-microservice', timestamp: new Date().toISOString() });
  });

  /** Runtime counters for translation/cache observability */
  app.get('/metrics', (_req: Request, res: Response) => {
    res.status(200).json({ counters: getAllCounters() });
  });

  /**
   * POST /searchFoods
   * Compatible with the current mobile client contract:
   *   Authorization: Bearer <Firebase ID token>
   *   { query: string, maxResults: number, region: string, language: string }
   */
  app.post(
    '/searchFoods',
    authGuard,
    validateSearchFoodsBody,
    searchFoodsController,
  );

  /**
   * POST /catalog/searchFoods
   * Internal Redis-backed multilingual catalog search.
   */
  app.post(
    '/catalog/searchFoods',
    authGuard,
    validateCatalogSearchBody,
    catalogSearchFoodsController,
  );

  /** Catalog readiness and index freshness */
  app.get('/catalog/health', catalogHealthController);

  /** Authenticated trigger for catalog seed sync */
  app.post('/catalog/admin/sync', authGuard, requireCatalogAdmin, validateCatalogSyncBody, catalogSyncController);

  /** Admin endpoint to update machine/reviewed/rejected localization status */
  app.post(
    '/catalog/admin/localization/review',
    authGuard,
    requireCatalogAdmin,
    validateCatalogLocalizationReviewBody,
    catalogLocalizationReviewController,
  );

  /** Click feedback signal for catalog popularity ranking */
  app.post('/catalog/feedback/click', authGuard, validateCatalogClickBody, catalogFeedbackClickController);

  // ─── 404 ───────────────────────────────────────────────────────────────────

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found', message: 'Endpoint not found' });
  });

  // ─── Global error handler ──────────────────────────────────────────────────

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ errorName: err.name }, 'Unhandled error');
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  });

  return app;
}
