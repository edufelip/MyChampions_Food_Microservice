import { Request, Response } from 'express';
import { catalogSearchFoodsController } from '../../../src/controllers/catalog-search-foods.controller';
import { unifiedSearchFoods } from '../../../src/services/unified-search.service';

jest.mock('../../../src/services/unified-search.service');

describe('catalogSearchFoodsController', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      body: {
        lang: 'pt',
        query: 'test',
        page: 1,
        pageSize: 10,
        region: 'br',
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('calls unifiedSearchFoods and returns 200', async () => {
    (unifiedSearchFoods as jest.Mock).mockResolvedValue({
      source: 'catalog',
      total: 5,
    });

    await catalogSearchFoodsController(req as Request, res as Response);

    expect(unifiedSearchFoods).toHaveBeenCalledWith('test', 10, 'br', 'pt', 1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      source: 'catalog',
      total: 5,
    });
  });

  it('returns 500 on error', async () => {
    (unifiedSearchFoods as jest.Mock).mockRejectedValue(new Error('Boom'));

    await catalogSearchFoodsController(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  });
});
