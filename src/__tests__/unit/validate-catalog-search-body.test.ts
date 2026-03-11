import { NextFunction, Request, Response } from 'express';
import { validateCatalogSearchBody } from '../../middleware/validate-catalog-search-body';

function mockReq(body: unknown): Partial<Request> {
  return { body };
}

function mockRes(): { res: Partial<Response>; statusFn: jest.Mock; jsonFn: jest.Mock } {
  const jsonFn = jest.fn();
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
  const res: Partial<Response> = { status: statusFn as never };
  return { res, statusFn, jsonFn };
}

describe('validateCatalogSearchBody', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  it('rejects unsupported language', () => {
    const req = mockReq({ lang: 'de', query: 'rice', page: 1, pageSize: 10 });
    const { res, statusFn } = mockRes();

    validateCatalogSearchBody(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid page/pageSize', () => {
    const req = mockReq({ lang: 'en', query: 'rice', page: 0, pageSize: 0 });
    const { res, statusFn } = mockRes();

    validateCatalogSearchBody(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts valid payload, trims values and caps pageSize', () => {
    const req = mockReq({
      lang: 'pt',
      query: '  arroz  ',
      page: 1,
      pageSize: 999,
      region: '  br ',
    });
    const { res } = mockRes();

    validateCatalogSearchBody(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect((req as Request).body).toEqual({
      lang: 'pt',
      query: 'arroz',
      page: 1,
      pageSize: 50,
      region: 'br',
    });
  });

  it('applies default page/pageSize when omitted', () => {
    const req = mockReq({
      lang: 'en',
      query: 'rice',
    });
    const { res } = mockRes();

    validateCatalogSearchBody(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect((req as Request).body).toEqual({
      lang: 'en',
      query: 'rice',
      page: 1,
      pageSize: 20,
      region: undefined,
    });
  });
});
