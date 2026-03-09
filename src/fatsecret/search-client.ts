/**
 * FatSecret foods.search API client.
 *
 * Calls the FatSecret REST API with exponential-backoff retries on transient
 * errors (5xx, network timeout). Non-retryable errors (4xx) are rethrown
 * immediately so callers can map them to appropriate HTTP responses.
 */
import axios, { AxiosError } from 'axios';
import qs from 'qs';
import { config } from '../config';
import { logger } from '../logger';
import { getAccessToken } from './token-provider';
import { mapFatSecretResponse, FatSecretFoodItem } from './response-mapper';

export class FatSecretError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly fatSecretCode?: string,
  ) {
    super(message);
    this.name = 'FatSecretError';
  }
}

function getFatSecretBodyError(data: unknown): { code?: string; message?: string } | null {
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, unknown>;
  const error = root['error'];
  if (!error || typeof error !== 'object') return null;
  const errObj = error as Record<string, unknown>;
  return {
    code: errObj['code'] !== undefined ? String(errObj['code']) : undefined,
    message: errObj['message'] !== undefined ? String(errObj['message']) : undefined,
  };
}

function isTransient(err: unknown): boolean {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    // Retry on network errors or 5xx from upstream
    if (!status || status >= 500) return true;
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Searches FatSecret for foods matching `query`, returning up to
 * `maxResults` normalized food items.
 */
export async function searchFoods(
  query: string,
  maxResults: number,
): Promise<FatSecretFoodItem[]> {
  let lastError: unknown;
  const maxAttempts = config.upstreamRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const accessToken = await getAccessToken();

      const params = qs.stringify({
        method: 'foods.search',
        search_expression: query,
        max_results: maxResults,
        format: 'json',
      });

      logger.info({ queryLength: query.length, maxResults, attempt }, 'Calling FatSecret foods.search');

      const response = await axios.get<unknown>(
        `${config.fatSecretApiUrl}?${params}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: config.upstreamTimeoutMs,
        },
      );

      const bodyError = getFatSecretBodyError(response.data);
      if (bodyError?.code === '22') {
        throw new FatSecretError('quota_exceeded', 403, 'quota_exceeded');
      }
      if (bodyError?.code === '21') {
        throw new FatSecretError('upstream_ip_not_allowlisted', 502, 'upstream_ip_not_allowlisted');
      }
      if (bodyError?.code) {
        throw new FatSecretError(
          bodyError.message ?? 'FatSecret upstream error',
          502,
          'upstream_error',
        );
      }

      const results = mapFatSecretResponse(response.data);
      logger.info({ resultCount: results.length }, 'FatSecret search complete');
      return results;
    } catch (err) {
      lastError = err;

      if (err instanceof AxiosError) {
        const status = err.response?.status;
        const body = err.response?.data as Record<string, unknown> | undefined;

        // Detect FatSecret quota exceeded
        if (status === 400 || status === 403) {
          const errorCode = (body?.['error'] as Record<string, unknown>)?.['code'];
          if (String(errorCode) === '22') {
            throw new FatSecretError('quota_exceeded', status, 'quota_exceeded');
          }
          throw new FatSecretError(
            `FatSecret returned ${status}`,
            status,
            String(errorCode ?? 'unknown'),
          );
        }
      }

      if (attempt < maxAttempts && isTransient(err)) {
        const delay = 200 * Math.pow(2, attempt - 1);
        logger.warn({ attempt, delay }, 'Transient error – retrying FatSecret call');
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  throw lastError;
}
