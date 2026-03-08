/**
 * Unit tests – request validation middleware.
 */
import { Request, Response, NextFunction } from 'express';
import { validateSearchFoodsBody } from '../../middleware/request-validator';

function mockReq(body: unknown): Partial<Request> {
  return { body };
}

function mockRes(): { res: Partial<Response>; statusFn: jest.Mock; jsonFn: jest.Mock } {
  const jsonFn = jest.fn();
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
  const res: Partial<Response> = { status: statusFn as never };
  return { res, statusFn, jsonFn };
}

describe('validateSearchFoodsBody middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  it('returns 400 when query is missing', () => {
    const req = mockReq({ maxResults: 10 });
    const { res, statusFn } = mockRes();

    validateSearchFoodsBody(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when query is empty string', () => {
    const req = mockReq({ query: '   ', maxResults: 10 });
    const { res, statusFn } = mockRes();

    validateSearchFoodsBody(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when maxResults is missing', () => {
    const req = mockReq({ query: 'chicken' });
    const { res, statusFn } = mockRes();

    validateSearchFoodsBody(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when maxResults is 0', () => {
    const req = mockReq({ query: 'chicken', maxResults: 0 });
    const { res, statusFn } = mockRes();

    validateSearchFoodsBody(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when maxResults is a float', () => {
    const req = mockReq({ query: 'chicken', maxResults: 1.5 });
    const { res, statusFn } = mockRes();

    validateSearchFoodsBody(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next with valid body and trims query', () => {
    const req = mockReq({ query: '  chicken  ', maxResults: 10 });
    const { res } = mockRes();

    validateSearchFoodsBody(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect((req as Request).body).toEqual({ query: 'chicken', maxResults: 10 });
  });

  it('caps maxResults to configured limit (50)', () => {
    const req = mockReq({ query: 'chicken', maxResults: 999 });
    const { res } = mockRes();

    validateSearchFoodsBody(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect((req as Request).body.maxResults).toBe(50);
  });
});
