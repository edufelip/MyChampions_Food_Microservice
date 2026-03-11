import { NextFunction, Request, Response } from 'express';
import { validateCatalogSyncBody } from '../../middleware/validate-catalog-sync-body';

function mockReq(body: unknown): Partial<Request> {
  return { body };
}

function mockRes(): { res: Partial<Response>; statusFn: jest.Mock; jsonFn: jest.Mock } {
  const jsonFn = jest.fn();
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
  const res: Partial<Response> = { status: statusFn as never };
  return { res, statusFn, jsonFn };
}

describe('validateCatalogSyncBody', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  it('rejects invalid seedQueries type', () => {
    const req = mockReq({ seedQueries: 'rice' });
    const { res, statusFn } = mockRes();

    validateCatalogSyncBody(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid maxResultsPerQuery', () => {
    const req = mockReq({ maxResultsPerQuery: 9999 });
    const { res, statusFn } = mockRes();

    validateCatalogSyncBody(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects empty seedQueries array', () => {
    const req = mockReq({ seedQueries: [] });
    const { res, statusFn } = mockRes();

    validateCatalogSyncBody(req as Request, res as Response, next);
    expect(statusFn).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts valid payload', () => {
    const req = mockReq({ seedQueries: [' rice '], region: ' us ', maxResultsPerQuery: 10 });
    const { res } = mockRes();

    validateCatalogSyncBody(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect((req as Request).body).toEqual({
      seedQueries: ['rice'],
      region: 'us',
      maxResultsPerQuery: 10,
    });
  });
});
