import { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { CatalogLanguage, isCatalogLanguage } from '../catalog/domain/catalog-language';

export interface CatalogSearchFoodsBody {
  lang: CatalogLanguage;
  query: string;
  page: number;
  pageSize: number;
  region?: string;
}

export function validateCatalogSearchBody(req: Request, res: Response, next: NextFunction): void {
  const payload = req.body as Partial<CatalogSearchFoodsBody>;

  if (typeof payload.lang !== 'string' || !isCatalogLanguage(payload.lang)) {
    res.status(400).json({
      error: 'bad_request',
      message: '`lang` must be one of: en, pt, es, fr, it',
    });
    return;
  }

  if (typeof payload.query !== 'string') {
    res.status(400).json({
      error: 'bad_request',
      message: '`query` must be a string',
    });
    return;
  }

  if (
    payload.page !== undefined &&
    (
      typeof payload.page !== 'number' ||
      !Number.isInteger(payload.page) ||
      payload.page < 1
    )
  ) {
    res.status(400).json({
      error: 'bad_request',
      message: '`page` must be a positive integer',
    });
    return;
  }

  if (
    payload.pageSize !== undefined &&
    (
      typeof payload.pageSize !== 'number' ||
      !Number.isInteger(payload.pageSize) ||
      payload.pageSize < 1
    )
  ) {
    res.status(400).json({
      error: 'bad_request',
      message: '`pageSize` must be a positive integer',
    });
    return;
  }

  if (payload.region !== undefined && typeof payload.region !== 'string') {
    res.status(400).json({
      error: 'bad_request',
      message: '`region` must be a string when provided',
    });
    return;
  }

  req.body = {
    lang: payload.lang,
    query: payload.query.trim(),
    page: payload.page ?? 1,
    pageSize: Math.min(payload.pageSize ?? config.catalogDefaultPageSize, config.catalogMaxPageSize),
    region: payload.region?.trim(),
  } satisfies CatalogSearchFoodsBody;

  next();
}
