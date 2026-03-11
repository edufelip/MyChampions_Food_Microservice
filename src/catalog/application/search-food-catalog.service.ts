import { config } from '../../config';
import { logger } from '../../logger';
import { CatalogProviderPort } from '../domain/catalog-ports';
import { CatalogSearchRequest, CatalogSearchResponse } from '../domain/catalog-models';
import { normalizeCatalogQuery } from './query-normalizer';

interface SearchFoodCatalogServiceDeps {
  provider: CatalogProviderPort;
  now: () => number;
}

export function createSearchFoodCatalogService(
  deps: SearchFoodCatalogServiceDeps,
): (request: CatalogSearchRequest) => Promise<CatalogSearchResponse> {
  return async (request: CatalogSearchRequest): Promise<CatalogSearchResponse> => {
    const startedAt = deps.now();
    const normalizedQuery = normalizeCatalogQuery(request.query);

    const source =
      normalizedQuery.length < config.catalogMinQueryLength
        ? await deps.provider.getPopular({
            lang: request.lang,
            page: request.page,
            pageSize: request.pageSize,
            region: request.region,
          })
        : await deps.provider.searchByPrefix({
            lang: request.lang,
            normalizedQuery,
            page: request.page,
            pageSize: request.pageSize,
            region: request.region,
          });

    try {
      await deps.provider.recordServed({
        lang: request.lang,
        region: request.region,
        foodIds: source.items.map((item) => item.id),
      });
    } catch (error) {
      logger.warn({ error }, 'Failed to record served catalog items');
    }

    return {
      page: request.page,
      pageSize: request.pageSize,
      total: source.total,
      results: source.items,
      meta: {
        lang: request.lang,
        normalizedQuery,
        tookMs: Math.max(0, deps.now() - startedAt),
      },
    };
  };
}
