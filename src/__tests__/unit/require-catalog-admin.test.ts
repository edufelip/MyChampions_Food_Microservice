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

  // Regression for ET-59: the admin-key gate must never be coupled to the
  // unrelated ENABLE_CATALOG_INGESTION flag. ENABLE_CATALOG_INGESTION=false
  // is the documented default across .env.example, .env.local, and
  // .env.local.example, so this is the state the gate must hold up in.
  it('returns 403 for missing key even when ingestion feature is disabled', async () => {
    process.env.ENABLE_CATALOG_INGESTION = 'false';
    process.env.CATALOG_ADMIN_API_KEY = 'secret';
    const { requireCatalogAdmin: middleware } = await import('../../middleware/require-catalog-admin');

    const req = mockReq();
    const { res, statusFn, jsonFn } = mockRes();
    middleware(req as Request, res as Response, next);
    expect(statusFn).toHaveBeenCalledWith(403);
    expect(jsonFn).toHaveBeenCalledWith({ error: 'forbidden', message: 'Missing catalog admin key' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for an invalid key even when ingestion feature is disabled', async () => {
    process.env.ENABLE_CATALOG_INGESTION = 'false';
    process.env.CATALOG_ADMIN_API_KEY = 'secret';
    const { requireCatalogAdmin: middleware } = await import('../../middleware/require-catalog-admin');

    const req = mockReq('wrong-key');
    const { res, statusFn } = mockRes();
    middleware(req as Request, res as Response, next);
    expect(statusFn).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when a valid key is presented while ingestion is disabled', async () => {
    process.env.ENABLE_CATALOG_INGESTION = 'false';
    process.env.CATALOG_ADMIN_API_KEY = 'secret';
    const { requireCatalogAdmin: middleware } = await import('../../middleware/require-catalog-admin');

    const req = mockReq('secret');
    const { res, statusFn } = mockRes();
    middleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect(statusFn).not.toHaveBeenCalled();
  });

  it('returns 503 catalog_admin_misconfigured when no admin key is configured, regardless of ingestion flag', async () => {
    process.env.ENABLE_CATALOG_INGESTION = 'false';
    process.env.CATALOG_ADMIN_API_KEY = '';
    const { requireCatalogAdmin: middleware } = await import('../../middleware/require-catalog-admin');

    const req = mockReq();
    const { res, statusFn, jsonFn } = mockRes();
    middleware(req as Request, res as Response, next);
    expect(statusFn).toHaveBeenCalledWith(503);
    expect(jsonFn).toHaveBeenCalledWith({
      error: 'catalog_admin_misconfigured',
      message: 'Catalog admin key is not configured',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for missing key when ingestion is enabled', async () => {
    process.env.ENABLE_CATALOG_INGESTION = 'true';
    process.env.CATALOG_ADMIN_API_KEY = 'secret';
    const { requireCatalogAdmin: middleware } = await import('../../middleware/require-catalog-admin');

    const req = mockReq();
    const { res, statusFn } = mockRes();
    middleware(req as Request, res as Response, next);
    expect(statusFn).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
