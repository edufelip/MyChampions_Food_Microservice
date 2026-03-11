import { NextFunction, Request, Response } from 'express';
import { CatalogLanguage, isCatalogLanguage } from '../catalog/domain/catalog-language';
import { LocalizationReviewStatus } from '../catalog/domain/catalog-models';

const VALID_STATUSES: LocalizationReviewStatus[] = ['machine', 'reviewed', 'rejected'];

export interface CatalogLocalizationReviewBody {
  foodId: string;
  lang: CatalogLanguage;
  status: LocalizationReviewStatus;
  reviewerId?: string;
  localizedName?: string;
}

export function validateCatalogLocalizationReviewBody(req: Request, res: Response, next: NextFunction): void {
  const payload = (req.body ?? {}) as Partial<CatalogLocalizationReviewBody>;

  if (typeof payload.foodId !== 'string' || payload.foodId.trim().length === 0) {
    res.status(400).json({
      error: 'bad_request',
      message: '`foodId` must be a non-empty string',
    });
    return;
  }

  if (typeof payload.lang !== 'string' || !isCatalogLanguage(payload.lang)) {
    res.status(400).json({
      error: 'bad_request',
      message: '`lang` must be one of: en, pt, es, fr, it',
    });
    return;
  }

  if (typeof payload.status !== 'string' || !VALID_STATUSES.includes(payload.status as LocalizationReviewStatus)) {
    res.status(400).json({
      error: 'bad_request',
      message: '`status` must be one of: machine, reviewed, rejected',
    });
    return;
  }

  if (payload.reviewerId !== undefined && (typeof payload.reviewerId !== 'string' || payload.reviewerId.trim().length === 0)) {
    res.status(400).json({
      error: 'bad_request',
      message: '`reviewerId` must be a non-empty string when provided',
    });
    return;
  }

  if (payload.localizedName !== undefined && (typeof payload.localizedName !== 'string' || payload.localizedName.trim().length === 0)) {
    res.status(400).json({
      error: 'bad_request',
      message: '`localizedName` must be a non-empty string when provided',
    });
    return;
  }

  req.body = {
    foodId: payload.foodId.trim(),
    lang: payload.lang,
    status: payload.status as LocalizationReviewStatus,
    reviewerId: payload.reviewerId?.trim(),
    localizedName: payload.localizedName?.trim(),
  } satisfies CatalogLocalizationReviewBody;
  next();
}
