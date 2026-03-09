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
