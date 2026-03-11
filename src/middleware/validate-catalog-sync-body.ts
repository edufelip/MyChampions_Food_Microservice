import { NextFunction, Request, Response } from 'express';
import { config } from '../config';

export interface CatalogSyncBody {
  seedQueries?: string[];
  region?: string;
  maxResultsPerQuery?: number;
}

export function validateCatalogSyncBody(req: Request, res: Response, next: NextFunction): void {
  const payload = (req.body ?? {}) as Partial<CatalogSyncBody>;

  if (payload.seedQueries !== undefined) {
    if (!Array.isArray(payload.seedQueries)) {
      res.status(400).json({
        error: 'bad_request',
        message: '`seedQueries` must be an array of strings when provided',
      });
      return;
    }
    if (payload.seedQueries.length === 0) {
      res.status(400).json({
        error: 'bad_request',
        message: '`seedQueries` must contain at least one query when provided',
      });
      return;
    }
    if (!payload.seedQueries.every((item) => typeof item === 'string' && item.trim().length > 0)) {
      res.status(400).json({
        error: 'bad_request',
        message: '`seedQueries` must contain non-empty strings only',
      });
      return;
    }
  }

  if (payload.region !== undefined && (typeof payload.region !== 'string' || payload.region.trim().length === 0)) {
    res.status(400).json({
      error: 'bad_request',
      message: '`region` must be a non-empty string when provided',
    });
    return;
  }

  if (payload.maxResultsPerQuery !== undefined) {
    if (
      typeof payload.maxResultsPerQuery !== 'number' ||
      !Number.isInteger(payload.maxResultsPerQuery) ||
      payload.maxResultsPerQuery < 1 ||
      payload.maxResultsPerQuery > config.maxResultsLimit
    ) {
      res.status(400).json({
        error: 'bad_request',
        message: `'maxResultsPerQuery' must be an integer between 1 and ${config.maxResultsLimit}`,
      });
      return;
    }
  }

  req.body = {
    seedQueries: payload.seedQueries?.map((item) => item.trim()),
    region: payload.region?.trim(),
    maxResultsPerQuery: payload.maxResultsPerQuery,
  } satisfies CatalogSyncBody;
  next();
}
