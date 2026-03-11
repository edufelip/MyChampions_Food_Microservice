import { NextFunction, Request, Response } from 'express';
import { validateCatalogClickBody } from '../../middleware/validate-catalog-click-body';

function mockReq(body: unknown): Partial<Request> {
  return { body };
}

function mockRes(): { res: Partial<Response>; statusFn: jest.Mock; jsonFn: jest.Mock } {
  const jsonFn = jest.fn();
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
  const res: Partial<Response> = { status: statusFn as never };
  return { res, statusFn, jsonFn };
}

describe('validateCatalogClickBody', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  it('rejects invalid language', () => {
    const req = mockReq({ lang: 'de', foodId: '1' });
    const { res, statusFn } = mockRes();

    validateCatalogClickBody(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects empty foodId', () => {
    const req = mockReq({ lang: 'en', foodId: '   ' });
    const { res, statusFn } = mockRes();

    validateCatalogClickBody(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts valid payload', () => {
    const req = mockReq({ lang: 'en', foodId: ' 123 ', region: ' us ' });
    const { res } = mockRes();

    validateCatalogClickBody(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect((req as Request).body).toEqual({
      lang: 'en',
      foodId: '123',
      region: 'us',
    });
  });
});
