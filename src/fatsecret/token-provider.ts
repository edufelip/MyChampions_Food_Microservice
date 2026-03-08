/**
 * FatSecret OAuth2 client-credentials token provider with in-memory cache.
 *
 * Fetches a new access token when none is cached or when the cached token
 * is within `TOKEN_EXPIRY_MARGIN_SECONDS` of expiry.
 */
import axios from 'axios';
import qs from 'qs';
import { config } from '../config';
import { logger } from '../logger';

export interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix epoch ms
}

let cached: CachedToken | null = null;

function isTokenValid(token: CachedToken): boolean {
  const marginMs = config.tokenExpiryMarginSeconds * 1000;
  return Date.now() < token.expiresAt - marginMs;
}

/**
 * Returns a valid FatSecret access token, fetching a new one if necessary.
 */
export async function getAccessToken(): Promise<string> {
  if (cached && isTokenValid(cached)) {
    logger.debug('Using cached FatSecret token');
    return cached.accessToken;
  }

  logger.info('Fetching new FatSecret access token');

  const response = await axios.post<{
    access_token: string;
    expires_in: number;
    token_type: string;
  }>(
    config.fatSecretTokenUrl,
    qs.stringify({ grant_type: 'client_credentials', scope: 'basic' }),
    {
      auth: {
        username: config.fatSecretClientId(),
        password: config.fatSecretClientSecret(),
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: config.upstreamTimeoutMs,
    },
  );

  const { access_token, expires_in } = response.data;
  cached = {
    accessToken: access_token,
    expiresAt: Date.now() + expires_in * 1000,
  };

  logger.info({ expiresIn: expires_in }, 'FatSecret token obtained');
  return cached.accessToken;
}

/** Exposed for testing – resets the in-memory cache */
export function _resetTokenCache(): void {
  cached = null;
}

/** Exposed for testing – injects a pre-built cached token */
export function _injectToken(token: CachedToken): void {
  cached = token;
}
