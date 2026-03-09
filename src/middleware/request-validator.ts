/**
 * Request body validation middleware for POST /searchFoods.
 *
 * Validates:
 * - `query`: non-empty string
 * - `maxResults`: positive integer, capped to MAX_RESULTS_LIMIT
 * - `region`: non-empty string
 * - `language`: non-empty string
 */
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export interface SearchFoodsBody {
  query: string;
  maxResults: number;
  region: string;
  language: string;
}

export function validateSearchFoodsBody(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { query, maxResults, region, language } = req.body as Partial<SearchFoodsBody>;

  if (typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({
      error: 'bad_request',
      message: '`query` must be a non-empty string',
    });
    return;
  }

  if (
    typeof maxResults !== 'number' ||
    !Number.isInteger(maxResults) ||
    maxResults < 1
  ) {
    res.status(400).json({
      error: 'bad_request',
      message: '`maxResults` must be a positive integer',
    });
    return;
  }

  if (typeof region !== 'string' || region.trim().length === 0) {
    res.status(400).json({
      error: 'bad_request',
      message: '`region` must be a non-empty string',
    });
    return;
  }

  if (typeof language !== 'string' || language.trim().length === 0) {
    res.status(400).json({
      error: 'bad_request',
      message: '`language` must be a non-empty string',
    });
    return;
  }

  // Sanitise: cap maxResults to configured limit
  req.body = {
    query: query.trim(),
    maxResults: Math.min(maxResults, config.maxResultsLimit),
    region: region.trim(),
    language: language.trim(),
  } satisfies SearchFoodsBody;

  next();
}
