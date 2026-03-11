import { NextFunction, Request, Response } from 'express';
import { CatalogLanguage, isCatalogLanguage } from '../catalog/domain/catalog-language';

export interface CatalogClickBody {
  lang: CatalogLanguage;
  foodId: string;
  region?: string;
}

export function validateCatalogClickBody(req: Request, res: Response, next: NextFunction): void {
  const payload = req.body as Partial<CatalogClickBody>;

  if (typeof payload.lang !== 'string' || !isCatalogLanguage(payload.lang)) {
    res.status(400).json({
      error: 'bad_request',
      message: '`lang` must be one of: en, pt, es, fr, it',
    });
    return;
  }

  if (typeof payload.foodId !== 'string' || payload.foodId.trim().length === 0) {
    res.status(400).json({
      error: 'bad_request',
      message: '`foodId` must be a non-empty string',
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
    foodId: payload.foodId.trim(),
    region: payload.region?.trim(),
  } satisfies CatalogClickBody;
  next();
}
