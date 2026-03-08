/**
 * Firebase Admin SDK initialization and ID token verification.
 *
 * Exports a single `verifyIdToken` function used by the auth middleware.
 * The Firebase app is initialised lazily on first call so tests can stub it.
 */
import * as admin from 'firebase-admin';
import { config } from '../config';
import { logger } from '../logger';

let app: admin.app.App | null = null;

function getApp(): admin.app.App {
  if (app) return app;

  const rawJson = config.firebaseServiceAccount();
  let serviceAccount: admin.ServiceAccount;

  try {
    // Support both raw JSON and base64-encoded JSON
    const decoded = Buffer.from(rawJson, 'base64').toString('utf8');
    serviceAccount = JSON.parse(decoded) as admin.ServiceAccount;
  } catch {
    try {
      serviceAccount = JSON.parse(rawJson) as admin.ServiceAccount;
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON or base64-encoded JSON');
    }
  }

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  logger.info('Firebase Admin SDK initialised');
  return app;
}

/**
 * Verifies a Firebase ID token and returns the decoded token.
 * Throws an error if the token is invalid or expired.
 */
export async function verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  const firebaseApp = getApp();
  return firebaseApp.auth().verifyIdToken(idToken);
}

/** Exposed for testing – resets the singleton app reference */
export function _resetFirebaseApp(): void {
  app = null;
}
