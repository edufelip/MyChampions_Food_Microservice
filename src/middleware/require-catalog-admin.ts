import { NextFunction, Request, Response } from 'express';
import { config } from '../config';

export function requireCatalogAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!config.enableCatalogIngestion) {
    next();
    return;
  }

  if (!config.catalogAdminApiKey) {
    res.status(503).json({
      error: 'catalog_admin_misconfigured',
      message: 'Catalog admin key is not configured',
    });
    return;
  }

  const header = req.headers['x-catalog-admin-key'];
  if (typeof header !== 'string' || header.trim().length === 0) {
    res.status(403).json({
      error: 'forbidden',
      message: 'Missing catalog admin key',
    });
    return;
  }

  if (header !== config.catalogAdminApiKey) {
    res.status(403).json({
      error: 'forbidden',
      message: 'Invalid catalog admin key',
    });
    return;
  }

  next();
}
