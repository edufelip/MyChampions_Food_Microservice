import { NextFunction, Request, Response } from 'express';

function mockReq(adminKey?: string): Partial<Request> {
  return {
    headers: adminKey ? { 'x-catalog-admin-key': adminKey } : {},
  };
}

function mockRes(): { res: Partial<Response>; statusFn: jest.Mock; jsonFn: jest.Mock } {
  const jsonFn = jest.fn();
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
  const res: Partial<Response> = { status: statusFn as never };
  return { res, statusFn, jsonFn };
}

describe('requireCatalogAdmin', () => {
  let next: NextFunction;
  const originalEnable = process.env.ENABLE_CATALOG_INGESTION;
  const originalAdminKey = process.env.CATALOG_ADMIN_API_KEY;

  beforeEach(() => {
    next = jest.fn();
    jest.resetModules();
  });

  afterAll(() => {
    process.env.ENABLE_CATALOG_INGESTION = originalEnable;
    process.env.CATALOG_ADMIN_API_KEY = originalAdminKey;
  });

  it('skips admin key check when ingestion feature is disabled', () => {
    process.env.ENABLE_CATALOG_INGESTION = 'false';
    process.env.CATALOG_ADMIN_API_KEY = '';
    const { requireCatalogAdmin: middleware } = require('../../middleware/require-catalog-admin') as typeof import('../../middleware/require-catalog-admin');

    const req = mockReq();
    const { res } = mockRes();
    middleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 for missing key when ingestion is enabled', () => {
    process.env.ENABLE_CATALOG_INGESTION = 'true';
    process.env.CATALOG_ADMIN_API_KEY = 'secret';
    const { requireCatalogAdmin: middleware } = require('../../middleware/require-catalog-admin') as typeof import('../../middleware/require-catalog-admin');

    const req = mockReq();
    const { res, statusFn } = mockRes();
    middleware(req as Request, res as Response, next);
    expect(statusFn).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
