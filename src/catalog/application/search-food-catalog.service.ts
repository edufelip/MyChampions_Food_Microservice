import { config } from '../../config';
import { logger } from '../../logger';
import { incrementCounter } from '../../metrics';
import { CatalogProviderPort } from '../domain/catalog-ports';
import { CatalogSearchRequest, CatalogSearchResponse } from '../domain/catalog-models';
import { buildCatalogQueryCandidates } from './query-rewrite';

interface SearchFoodCatalogServiceDeps {
  provider: CatalogProviderPort;
  now: () => number;
}

export function createSearchFoodCatalogService(
  deps: SearchFoodCatalogServiceDeps,
): (request: CatalogSearchRequest) => Promise<CatalogSearchResponse> {
  return async (request: CatalogSearchRequest): Promise<CatalogSearchResponse> => {
    const startedAt = deps.now();
    const queryRewrite = buildCatalogQueryCandidates(request.lang, request.query);
    const normalizedQuery = queryRewrite.normalizedQuery;
    let catalogReady = true;
    let catalogDocumentCount = 0;

    if (queryRewrite.rewrittenFrom) {
      incrementCounter('catalog.query_rewrite');
      incrementCounter(`catalog.query_rewrite.lang.${request.lang}`);
      logger.info(
        {
          lang: request.lang,
          rewrittenFrom: queryRewrite.rewrittenFrom,
          rewrittenTo: normalizedQuery,
        },
        'Catalog query rewritten using alias mapping',
      );
    }

    try {
      const health = await deps.provider.getHealth();
      catalogReady = health.ready;
      catalogDocumentCount = health.documentCount;
    } catch (error) {
      incrementCounter('catalog.health_check_failed');
      logger.warn({ error }, 'Failed to read catalog health before search');
    }

    if (!catalogReady) {
      incrementCounter('catalog.search_not_ready');
      incrementCounter(`catalog.search_not_ready.lang.${request.lang}`);
      if (request.region?.trim()) {
        incrementCounter(`catalog.search_not_ready.region.${request.region.trim().toLowerCase()}`);
      }
      logger.warn(
        {
          lang: request.lang,
          region: request.region,
          normalizedQuery,
          documentCount: catalogDocumentCount,
        },
        'Catalog search requested while catalog is not ready',
      );
    }

    const candidates = queryRewrite.candidateQueries.length > 0 ? queryRewrite.candidateQueries : [normalizedQuery];
    let source = { total: 0, items: [] as CatalogSearchResponse['results'] };
    let selectedNormalizedQuery = normalizedQuery;
    let lastAttemptedQuery = normalizedQuery;

    for (const candidate of candidates) {
      lastAttemptedQuery = candidate;
      source =
        candidate.length < config.catalogMinQueryLength
          ? await deps.provider.getPopular({
              lang: request.lang,
              page: request.page,
              pageSize: request.pageSize,
              region: request.region,
            })
          : await deps.provider.searchByPrefix({
              lang: request.lang,
              normalizedQuery: candidate,
              page: request.page,
              pageSize: request.pageSize,
              region: request.region,
            });

      if (source.total > 0) {
        selectedNormalizedQuery = candidate;
        break;
      }
    }

    if (lastAttemptedQuery.length > 0 && source.total === 0) {
      incrementCounter('catalog.empty_response');
      incrementCounter(`catalog.empty_response.lang.${request.lang}`);
      if (request.region?.trim()) {
        incrementCounter(`catalog.empty_response.region.${request.region.trim().toLowerCase()}`);
      }
      logger.warn(
        { lang: request.lang, region: request.region, normalizedQuery: lastAttemptedQuery, attempts: candidates },
        'Catalog search returned empty results',
      );
    }

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
        normalizedQuery: selectedNormalizedQuery,
        rewriteApplied: Boolean(queryRewrite.rewrittenFrom),
        rewrittenFrom: queryRewrite.rewrittenFrom,
        tookMs: Math.max(0, deps.now() - startedAt),
      },
    };
  };
}
