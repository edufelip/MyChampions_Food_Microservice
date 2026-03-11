/**
 * POST /searchFoods controller.
 *
 * Orchestrates: auth guard → input validation → FatSecret search → response.
 * Error mapping:
 *   - FatSecretError quota_exceeded → 200 with { error: "quota_exceeded" }
 *   - FatSecretError 4xx           → 400
 *   - Unknown upstream / internal  → 500 (safe message, no secrets)
 *
 * NOTE:
 *   The current mobile client checks `error === 'quota_exceeded'` only after a
 *   successful HTTP response. Returning HTTP 200 preserves that contract.
 */
import { Request, Response } from 'express';
import { searchFoods, FatSecretError } from '../fatsecret/search-client';
import { logger } from '../logger';
import { SearchFoodsBody } from '../middleware/request-validator';
import { searchFoodsLocalized } from '../services/search-foods-localized.service';
import { config } from '../config';

let loggedTranslationMisconfiguration = false;

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof FatSecretError) {
    return {
      name: err.name,
      statusCode: err.statusCode,
      fatSecretCode: err.fatSecretCode,
    };
  }
  if (err instanceof Error) {
    return { name: err.name };
  }
  return { type: typeof err };
}

export async function searchFoodsController(
  req: Request,
  res: Response,
): Promise<void> {
  const { query, maxResults, region, language } = req.body as SearchFoodsBody;
  const uid = res.locals['uid'] as string;
  const useTranslationPipeline =
    config.enableTranslationPipeline && config.hasGoogleTranslateApiKey;

  try {
    if (config.enableTranslationPipeline && !config.hasGoogleTranslateApiKey && !loggedTranslationMisconfiguration) {
      logger.error('ENABLE_TRANSLATION_PIPELINE=true but GOOGLE_TRANSLATE_API_KEY is missing; falling back to English flow');
      loggedTranslationMisconfiguration = true;
    }

    const results = useTranslationPipeline
      ? await searchFoodsLocalized(query, maxResults, region, language)
      : await searchFoods(query, maxResults, region, language);
    res.status(200).json({ results });
  } catch (err) {
    if (err instanceof FatSecretError) {
      if (err.fatSecretCode === 'quota_exceeded') {
        logger.warn({ uid }, 'FatSecret quota exceeded');
        res.status(200).json({ error: 'quota_exceeded' });
        return;
      }

      if (err.fatSecretCode === 'upstream_ip_not_allowlisted') {
        logger.error({ uid, error: serializeError(err) }, 'FatSecret IP allowlist mismatch');
        res.status(502).json({
          error: 'upstream_ip_not_allowlisted',
          message: 'Food provider IP allowlist mismatch',
        });
        return;
      }

      if (err.fatSecretCode === 'upstream_error' || (err.statusCode !== undefined && err.statusCode >= 500)) {
        logger.error({ uid, error: serializeError(err) }, 'FatSecret upstream unavailable');
        res.status(502).json({
          error: 'upstream_error',
          message: 'Food provider unavailable',
        });
        return;
      }

      logger.error({ uid, error: serializeError(err) }, 'FatSecret API error');
      res.status(400).json({ error: 'bad_request', message: 'Unable to process search request' });
      return;
    }

    logger.error({ uid, error: serializeError(err) }, 'Unexpected error during food search');
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
}
