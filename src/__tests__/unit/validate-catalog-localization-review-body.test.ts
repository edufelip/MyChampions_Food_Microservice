import { NextFunction, Request, Response } from 'express';
import { validateCatalogLocalizationReviewBody } from '../../middleware/validate-catalog-localization-review-body';

function mockReq(body: unknown): Partial<Request> {
  return { body };
}

function mockRes(): { res: Partial<Response>; statusFn: jest.Mock; jsonFn: jest.Mock } {
  const jsonFn = jest.fn();
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
  const res: Partial<Response> = { status: statusFn as never };
  return { res, statusFn, jsonFn };
}

describe('validateCatalogLocalizationReviewBody', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  it('rejects missing foodId', () => {
    const req = mockReq({ lang: 'en', status: 'reviewed' });
    const { res, statusFn } = mockRes();
    validateCatalogLocalizationReviewBody(req as Request, res as Response, next);
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it('rejects invalid status', () => {
    const req = mockReq({ foodId: '1', lang: 'en', status: 'done' });
    const { res, statusFn } = mockRes();
    validateCatalogLocalizationReviewBody(req as Request, res as Response, next);
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it('accepts valid payload', () => {
    const req = mockReq({
      foodId: ' 1 ',
      lang: 'pt',
      status: 'reviewed',
      reviewerId: ' rev-1 ',
      localizedName: ' Arroz ',
    });
    const { res } = mockRes();
    validateCatalogLocalizationReviewBody(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect((req as Request).body).toEqual({
      foodId: '1',
      lang: 'pt',
      status: 'reviewed',
      reviewerId: 'rev-1',
      localizedName: 'Arroz',
    });
  });
});
