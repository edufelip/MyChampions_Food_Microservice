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

export const config = {
  /** TCP port the HTTP server listens on */
  port: parseInt(optionalEnv('PORT', '3000'), 10),

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
  tokenExpiryMarginSeconds: parseInt(
    optionalEnv('TOKEN_EXPIRY_MARGIN_SECONDS', '60'),
    10,
  ),

  /** HTTP request timeout in milliseconds for upstream calls */
  upstreamTimeoutMs: parseInt(optionalEnv('UPSTREAM_TIMEOUT_MS', '10000'), 10),

  /** Max number of upstream retries on transient errors */
  upstreamRetries: parseInt(optionalEnv('UPSTREAM_RETRIES', '2'), 10),

  /** Rate limiting window in milliseconds */
  rateLimitWindowMs: parseInt(optionalEnv('RATE_LIMIT_WINDOW_MS', '60000'), 10),

  /** Max requests per IP per window */
  rateLimitMax: parseInt(optionalEnv('RATE_LIMIT_MAX', '60'), 10),

  /** Maximum allowed maxResults from client */
  maxResultsLimit: parseInt(optionalEnv('MAX_RESULTS_LIMIT', '50'), 10),

  /** Log level */
  logLevel: optionalEnv('LOG_LEVEL', 'info'),
} as const;
