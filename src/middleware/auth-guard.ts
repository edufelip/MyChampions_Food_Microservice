/**
 * Express middleware that enforces MyChampions server session authentication.
 *
 * Expects:  Authorization: Bearer <mychampions-access-token>
 * On success: attaches `res.locals.uid` with the authenticated user ID.
 * On session rejection: responds 401; on auth-authority failure: responds 503.
 */
import { Request, Response, NextFunction } from 'express';
import {
  MyChampionsAuthError,
  verifyMyChampionsAccessToken,
} from '../auth/mychampions-auth';
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

  const accessToken = parts[1];

  try {
    const user = await verifyMyChampionsAccessToken(accessToken);
    res.locals['uid'] = user.uid;
    next();
  } catch (error) {
    if (error instanceof MyChampionsAuthError && error.code === 'unauthenticated') {
      logger.warn({ reason: 'root_auth_rejected' }, 'MyChampions access token verification failed');
      res.status(401).json({ error: 'unauthenticated', message: 'Invalid or expired token' });
      return;
    }

    logger.warn(
      {
        reason: 'root_auth_unavailable',
        error: error instanceof Error ? error.message : String(error),
      },
      'MyChampions auth server is unavailable',
    );
    res.status(503).json({ error: 'auth_unavailable', message: 'Authentication service is unavailable' });
    return;
  }
}
