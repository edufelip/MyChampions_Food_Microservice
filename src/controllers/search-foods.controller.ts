/**
 * POST /searchFoods controller.
 *
 * Orchestrates: auth guard → input validation → FatSecret search → response.
 * Error mapping:
 *   - FatSecretError quota_exceeded → 429 (or 200+error for client compat – see note below)
 *   - FatSecretError 4xx           → 400
 *   - Unknown upstream / internal  → 500 (safe message, no secrets)
 *
 * Note on quota status code:
 *   The client already handles `{ error: "quota_exceeded" }` as a special
 *   case AND catches any non-2xx as a generic error string. Using HTTP 429
 *   keeps the semantics correct and is safe: the client's non-2xx branch
 *   fires, showing a generic error. If the client ever needs to display the
 *   quota message specifically, it only needs to check the 429 body.
 */
import { Request, Response } from 'express';
import { searchFoods, FatSecretError } from '../fatsecret/search-client';
import { logger } from '../logger';
import { SearchFoodsBody } from '../middleware/request-validator';

export async function searchFoodsController(
  req: Request,
  res: Response,
): Promise<void> {
  const { query, maxResults } = req.body as SearchFoodsBody;
  const uid = res.locals['uid'] as string;

  try {
    const results = await searchFoods(query, maxResults);
    res.status(200).json({ results });
  } catch (err) {
    if (err instanceof FatSecretError) {
      if (err.fatSecretCode === 'quota_exceeded') {
        logger.warn({ uid }, 'FatSecret quota exceeded');
        res.status(429).json({ error: 'quota_exceeded', message: 'Search quota exceeded. Please try again later.' });
        return;
      }

      logger.error({ err, uid }, 'FatSecret API error');
      res.status(400).json({ error: 'bad_request', message: 'Unable to process search request' });
      return;
    }

    logger.error({ err, uid }, 'Unexpected error during food search');
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
}
