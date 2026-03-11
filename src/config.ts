import { DEFAULT_CATALOG_SEED_QUERIES } from './catalog/seeds/default-seed-queries';

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

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = optionalEnv(name, String(fallback)).trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  throw new Error(`Environment variable ${name} must be a boolean`);
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

function parseCsvList(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
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

  /** Feature flag for translation pipeline around food search */
  enableTranslationPipeline: parseBooleanEnv('ENABLE_TRANSLATION_PIPELINE', true),

  /** Whether Google Translate API key is configured */
  hasGoogleTranslateApiKey: optionalEnv('GOOGLE_TRANSLATE_API_KEY', '').trim().length > 0,

  /** Google Translate API key */
  googleTranslateApiKey: (): string => requireEnv('GOOGLE_TRANSLATE_API_KEY'),

  /** Google Translate API base URL */
  googleTranslateBaseUrl: optionalEnv(
    'GOOGLE_TRANSLATE_BASE_URL',
    'https://translation.googleapis.com/language/translate/v2',
  ),

  /** Timeout in milliseconds for Google Translate API calls */
  translationTimeoutMs: parseIntegerEnv('TRANSLATION_TIMEOUT_MS', '5000', { min: 100 }),

  /** Max retries for transient Google Translate API errors */
  translationRetries: parseIntegerEnv('TRANSLATION_RETRIES', '2', { min: 0, max: 8 }),

  /** Base delay in milliseconds for translation retry backoff */
  translationRetryBaseDelayMs: parseIntegerEnv('TRANSLATION_RETRY_BASE_DELAY_MS', '150', { min: 10, max: 5000 }),

  /** Redis URL used for translation cache storage */
  redisUrl: optionalEnv('REDIS_URL', ''),

  /** Query translation cache TTL (seconds) */
  queryTranslationCacheTtlSeconds: parseIntegerEnv('QUERY_TRANSLATION_CACHE_TTL_SECONDS', '2592000', { min: 60 }),

  /** Catalog search is always enabled */
  enableCatalogSearch: true,

  /** Catalog index/version namespace suffix to support safe index migrations */
  catalogIndexVersion: optionalEnv('CATALOG_INDEX_VERSION', 'v1'),

  /** Minimum normalized query length before switching from popular feed to index search */
  catalogMinQueryLength: parseIntegerEnv('CATALOG_MIN_QUERY_LENGTH', '2', { min: 0, max: 20 }),

  /** Max bounded edit-distance used by typo-tolerant search (future phase) */
  catalogTypoMaxDistance: parseIntegerEnv('CATALOG_TYPO_MAX_DISTANCE', '1', { min: 0, max: 3 }),

  /** Planned catalog ingestion sync interval in seconds */
  catalogSyncIntervalSeconds: parseIntegerEnv('CATALOG_SYNC_INTERVAL_SECONDS', '3600', { min: 60 }),

  /** Default catalog page size when not provided by client */
  catalogDefaultPageSize: parseIntegerEnv('CATALOG_DEFAULT_PAGE_SIZE', '20', { min: 1, max: 100 }),

  /** Maximum catalog page size allowed from client */
  catalogMaxPageSize: parseIntegerEnv('CATALOG_MAX_PAGE_SIZE', '50', { min: 1, max: 100 }),

  /** Feature flag for catalog ingestion/sync operations */
  enableCatalogIngestion: parseBooleanEnv('ENABLE_CATALOG_INGESTION', false),

  /** Shared secret required for catalog admin ingestion endpoints */
  catalogAdminApiKey: optionalEnv('CATALOG_ADMIN_API_KEY', '').trim(),

  /** Comma-separated seed queries for catalog sync from FatSecret */
  catalogSyncSeedQueries: (() => {
    const override = process.env['CATALOG_SYNC_SEED_QUERIES'];
    if (override !== undefined) {
      return parseCsvList(override);
    }
    return DEFAULT_CATALOG_SEED_QUERIES;
  })(),

  /** Region used for seed ingestion requests to FatSecret */
  catalogSyncRegion: optionalEnv('CATALOG_SYNC_REGION', 'US').trim() || 'US',

  /** Max results fetched per seed query during catalog sync */
  catalogSyncMaxResultsPerQuery: parseIntegerEnv('CATALOG_SYNC_MAX_RESULTS_PER_QUERY', '50', { min: 1, max: 200 }),

  /** Log level */
  logLevel: optionalEnv('LOG_LEVEL', 'info'),
} as const;
