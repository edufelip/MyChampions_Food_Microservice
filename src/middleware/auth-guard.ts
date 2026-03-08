/**
 * Express middleware that enforces Firebase ID token authentication.
 *
 * Expects:  Authorization: Bearer <firebase-id-token>
 * On success: attaches `res.locals.uid` with the authenticated user ID.
 * On failure: responds 401 with a safe error message.
 */
import { Request, Response, NextFunction } from 'express';
import { verifyIdToken } from '../auth/firebase-auth';
import { logger } from '../logger';

export async function authGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'] ?? req.headers['Authorization'];

  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({ error: 'unauthenticated', message: 'Missing Authorization header' });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({ error: 'unauthenticated', message: 'Invalid Authorization header format' });
    return;
  }

  const idToken = parts[1];

  try {
    const decoded = await verifyIdToken(idToken);
    res.locals['uid'] = decoded.uid;
    next();
  } catch (err) {
    logger.warn({ err }, 'Firebase ID token verification failed');
    res.status(401).json({ error: 'unauthenticated', message: 'Invalid or expired token' });
  }
}
