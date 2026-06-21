import { Request, Response } from 'express';
import { CatalogSearchFoodsBody } from '../middleware/validate-catalog-search-body';
import { logger } from '../logger';
import { unifiedSearchFoods } from '../services/unified-search.service';

export async function catalogSearchFoodsController(req: Request, res: Response): Promise<void> {
  const { lang, query, page, pageSize, region } = req.body as CatalogSearchFoodsBody;

  try {
    const response = await unifiedSearchFoods(
      query,
      pageSize,
      region ?? 'US',
      lang,
      page
    );

    res.status(200).json(response);
  } catch (error) {
    logger.error({ error }, 'Unexpected error during catalog food search');
    res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
}
