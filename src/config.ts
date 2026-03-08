/**
 * Central configuration module – reads environment variables once and
 * exposes a typed, validated config object. Fails fast if a required
 * variable is missing so the service never starts in a broken state.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function parseIntegerEnv(
  name: string,
  fallback: string,
  constraints: { min?: number; max?: number } = {},
): number {
  const raw = optionalEnv(name, fallback).trim();
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`Environment variable ${name} must be a valid integer`);
  }
  const parsed = Number.parseInt(raw, 10);

  if (constraints.min !== undefined && parsed < constraints.min) {
    throw new Error(`Environment variable ${name} must be >= ${constraints.min}`);
  }
  if (constraints.max !== undefined && parsed > constraints.max) {
    throw new Error(`Environment variable ${name} must be <= ${constraints.max}`);
  }

  return parsed;
}

export const config = {
  /** TCP port the HTTP server listens on */
  port: parseIntegerEnv('PORT', '3000', { min: 1, max: 65535 }),

  /** Node environment */
  nodeEnv: optionalEnv('NODE_ENV', 'production'),

  /** Firebase service account JSON (base64-encoded or raw JSON string) */
  firebaseServiceAccount: (): string => requireEnv('FIREBASE_SERVICE_ACCOUNT_JSON'),

  /** FatSecret API base URL */
  fatSecretApiUrl: optionalEnv(
    'FATSECRET_API_URL',
    'https://platform.fatsecret.com/rest/server.api',
  ),

  /** FatSecret OAuth token URL */
  fatSecretTokenUrl: optionalEnv(
    'FATSECRET_TOKEN_URL',
    'https://oauth.fatsecret.com/connect/token',
  ),

  /** FatSecret OAuth2 client credentials */
  fatSecretClientId: (): string => requireEnv('FATSECRET_CLIENT_ID'),
  fatSecretClientSecret: (): string => requireEnv('FATSECRET_CLIENT_SECRET'),

  /** Number of seconds before FatSecret token expiry to trigger a refresh */
  tokenExpiryMarginSeconds: parseIntegerEnv('TOKEN_EXPIRY_MARGIN_SECONDS', '60', { min: 0 }),

  /** HTTP request timeout in milliseconds for upstream calls */
  upstreamTimeoutMs: parseIntegerEnv('UPSTREAM_TIMEOUT_MS', '10000', { min: 100 }),

  /** Max number of upstream retries on transient errors */
  upstreamRetries: parseIntegerEnv('UPSTREAM_RETRIES', '2', { min: 0 }),

  /** Rate limiting window in milliseconds */
  rateLimitWindowMs: parseIntegerEnv('RATE_LIMIT_WINDOW_MS', '60000', { min: 1000 }),

  /** Max requests per IP per window */
  rateLimitMax: parseIntegerEnv('RATE_LIMIT_MAX', '60', { min: 1 }),

  /** Maximum allowed maxResults from client */
  maxResultsLimit: parseIntegerEnv('MAX_RESULTS_LIMIT', '50', { min: 1, max: 200 }),

  /** Number of trusted proxy hops for correct client IP extraction behind Nginx */
  trustProxyHops: parseIntegerEnv('TRUST_PROXY_HOPS', '1', { min: 0 }),

  /** Log level */
  logLevel: optionalEnv('LOG_LEVEL', 'info'),
} as const;
