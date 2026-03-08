/**
 * Unit tests – auth guard middleware.
 */
import { Request, Response, NextFunction } from 'express';
import { authGuard } from '../../middleware/auth-guard';

// Mock Firebase auth module
jest.mock('../../auth/firebase-auth', () => ({
  verifyIdToken: jest.fn(),
}));

import { verifyIdToken } from '../../auth/firebase-auth';
const mockedVerify = verifyIdToken as jest.MockedFunction<typeof verifyIdToken>;

function mockReq(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  };
}

function mockRes(): { res: Partial<Response>; statusFn: jest.Mock; jsonFn: jest.Mock } {
  const jsonFn = jest.fn();
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
  const res: Partial<Response> = {
    status: statusFn as never,
    locals: {},
  };
  return { res, statusFn, jsonFn };
}

describe('authGuard middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = mockReq();
    const { res, statusFn, jsonFn } = mockRes();

    await authGuard(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'unauthenticated' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header has wrong format', async () => {
    const req = mockReq('InvalidFormat');
    const { res, statusFn } = mockRes();

    await authGuard(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token verification fails', async () => {
    mockedVerify.mockRejectedValue(new Error('Invalid token'));
    const req = mockReq('Bearer bad-token');
    const { res, statusFn, jsonFn } = mockRes();

    await authGuard(req as Request, res as Response, next);

    expect(statusFn).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'unauthenticated' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and sets uid when token is valid', async () => {
    mockedVerify.mockResolvedValue({ uid: 'user-123' } as never);
    const req = mockReq('Bearer valid-token');
    const { res } = mockRes();
    res.locals = {};

    await authGuard(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.locals?.['uid']).toBe('user-123');
  });
});
