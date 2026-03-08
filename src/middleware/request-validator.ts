/**
 * Request body validation middleware for POST /searchFoods.
 *
 * Validates:
 * - `query`: non-empty string
 * - `maxResults`: positive integer, capped to MAX_RESULTS_LIMIT
 */
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export interface SearchFoodsBody {
  query: string;
  maxResults: number;
}

export function validateSearchFoodsBody(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { query, maxResults } = req.body as Partial<SearchFoodsBody>;

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

  // Sanitise: cap maxResults to configured limit
  req.body = {
    query: query.trim(),
    maxResults: Math.min(maxResults, config.maxResultsLimit),
  } satisfies SearchFoodsBody;

  next();
}
