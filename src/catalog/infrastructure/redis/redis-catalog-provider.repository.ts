import { logger } from '../../../logger';
import { getRedisClient } from '../../../cache/redis-client';
import { CatalogProviderPort } from '../../domain/catalog-ports';
import { CatalogFoodItem, CatalogHealthSnapshot } from '../../domain/catalog-models';
import { CatalogLanguage } from '../../domain/catalog-language';
import {
  catalogActiveGenerationKey,
  catalogFoodDocumentKey,
  catalogFoodIndexKey,
  catalogFoodPopularityKey,
  catalogFoodStatsKey,
  catalogFoodSynonymKey,
  catalogLanguageTokenSetKey,
} from './food-catalog-keys';
import { config } from '../../../config';
import { normalizeCatalogQuery } from '../../application/query-normalizer';

interface CatalogFoodDocument {
  id: string;
  nutrition: {
    carbohydrate: number;
    protein: number;
    fat: number;
    serving: number;
  };
  localized?: Record<string, { name?: string; reviewStatus?: string }>;
  source?: string;
  region?: string;
}

const TIER_WEIGHT: Record<'exact' | 'prefix' | 'synonym' | 'typo', number> = {
  exact: 4000,
  prefix: 3000,
  synonym: 2000,
  typo: 1000,
};

const SERVED_POPULARITY_INCREMENT = 0.1;
const CLICK_POPULARITY_INCREMENT = 1;
const CANDIDATES_PER_TOKEN = 250;
const MAX_TYPO_TOKENS_PER_QUERY_TOKEN = 20;

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function tokenize(value: string): string[] {
  return normalizeCatalogQuery(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function toCatalogFoodItem(doc: CatalogFoodDocument, lang: CatalogLanguage): CatalogFoodItem | null {
  const localizedName = doc.localized?.[lang]?.name ?? doc.localized?.['en']?.name;
  if (!localizedName || !doc.id || !doc.nutrition) {
    return null;
  }

  return {
    id: doc.id,
    name: localizedName,
    carbohydrate: doc.nutrition.carbohydrate,
    protein: doc.nutrition.protein,
    fat: doc.nutrition.fat,
    serving: doc.nutrition.serving,
    source: doc.source,
    region: doc.region,
  };
}

function intersectAll(lists: string[][]): string[] {
  if (lists.length === 0) return [];
  const base = new Set(lists[0] ?? []);
  lists.slice(1).forEach((list) => {
    const localSet = new Set(list);
    Array.from(base).forEach((id) => {
      if (!localSet.has(id)) {
        base.delete(id);
      }
    });
  });
  return Array.from(base);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0]![j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }
  return matrix[a.length]![b.length]!;
}

export class RedisCatalogProviderRepository implements CatalogProviderPort {
  async searchByPrefix(params: {
    lang: CatalogLanguage;
    normalizedQuery: string;
    page: number;
    pageSize: number;
    region?: string;
  }): Promise<{ total: number; items: CatalogFoodItem[] }> {
    const client = getRedisClient();
    if (!client || params.normalizedQuery.length === 0) {
      return { total: 0, items: [] };
    }

    try {
      const generation = await this.getActiveGeneration();
      const queryTokens = tokenize(params.normalizedQuery);
      if (queryTokens.length === 0) {
        return { total: 0, items: [] };
      }

      const exactLists = await Promise.all(
        queryTokens.map((token) =>
          client.zrevrange(catalogFoodIndexKey(params.lang, token, generation), 0, CANDIDATES_PER_TOKEN - 1),
        ),
      );
      const exactIds = intersectAll(exactLists);

      const prefixLists = await Promise.all(
        queryTokens.map((token) =>
          client.zrevrange(catalogFoodIndexKey(params.lang, token, generation), 0, CANDIDATES_PER_TOKEN - 1),
        ),
      );
      const prefixIds = intersectAll(prefixLists);

      const synonymTokenArrays = await Promise.all(
        queryTokens.map((token) => client.smembers(catalogFoodSynonymKey(params.lang, token, generation))),
      );
      const synonymTokensByQueryToken = new Map<string, Set<string>>();
      queryTokens.forEach((token, index) => {
        synonymTokensByQueryToken.set(token, new Set(synonymTokenArrays[index] ?? []));
      });

      const synonymIdArrays = await Promise.all(
        synonymTokenArrays
          .flat()
          .map((token) => client.zrevrange(catalogFoodIndexKey(params.lang, token, generation), 0, CANDIDATES_PER_TOKEN - 1)),
      );
      const synonymIds = synonymIdArrays.flat();

      const typoTokensByQueryToken = await this.findTypoCandidateTokens(params.lang, generation, queryTokens);
      const typoIdArrays = await Promise.all(
        Array.from(typoTokensByQueryToken.values())
          .flatMap((tokens) => Array.from(tokens))
          .map((token) => client.zrevrange(catalogFoodIndexKey(params.lang, token, generation), 0, CANDIDATES_PER_TOKEN - 1)),
      );
      const typoIds = typoIdArrays.flat();

      const candidateIds = Array.from(new Set([...exactIds, ...prefixIds, ...synonymIds, ...typoIds]));
      const docsById = await this.getDocsById(candidateIds);
      const ranked = await this.rankCandidates({
        lang: params.lang,
        queryTokens,
        region: params.region,
        generation,
        docsById,
        synonymTokensByQueryToken,
        typoTokensByQueryToken,
      });

      const total = ranked.length;
      const start = (params.page - 1) * params.pageSize;
      const items = ranked.slice(start, start + params.pageSize).map(({ item }) => item);
      return { total, items };
    } catch (error) {
      logger.warn({ error }, 'Failed to search Redis catalog index');
      return { total: 0, items: [] };
    }
  }

  async getPopular(params: {
    lang: CatalogLanguage;
    page: number;
    pageSize: number;
    region?: string;
  }): Promise<{ total: number; items: CatalogFoodItem[] }> {
    const client = getRedisClient();
    if (!client) {
      return { total: 0, items: [] };
    }

    const generation = await this.getActiveGeneration();
    const key = catalogFoodPopularityKey(params.lang, params.region ?? 'GLOBAL', generation);
    const globalKey = catalogFoodPopularityKey(params.lang, 'GLOBAL', generation);
    const start = (params.page - 1) * params.pageSize;
    const stop = start + params.pageSize - 1;

    try {
      let [ids, total] = await Promise.all([
        client.zrevrange(key, start, stop),
        client.zcard(key),
      ]);

      if (ids.length === 0 && key !== globalKey) {
        [ids, total] = await Promise.all([
          client.zrevrange(globalKey, start, stop),
          client.zcard(globalKey),
        ]);
      }

      const items = await this.getItemsByIds(params.lang, ids);
      return { total, items };
    } catch (error) {
      logger.warn({ error, key }, 'Failed to fetch popular foods from Redis catalog');
      return { total: 0, items: [] };
    }
  }

  async getHealth(): Promise<CatalogHealthSnapshot> {
    const client = getRedisClient();
    if (!client) {
      return {
        enabled: config.enableCatalogSearch,
        ready: false,
        indexVersion: config.catalogIndexVersion,
        documentCount: 0,
        lastFreshnessAt: null,
      };
    }

    const statsKey = catalogFoodStatsKey();
    try {
      const [documentCountRaw, lastFreshnessAt] = await Promise.all([
        client.hget(statsKey, 'documentCount'),
        client.hget(statsKey, 'lastFreshnessAt'),
      ]);

      const documentCount = Number.parseInt(documentCountRaw ?? '0', 10);
      return {
        enabled: config.enableCatalogSearch,
        ready: Number.isFinite(documentCount) && documentCount > 0,
        indexVersion: config.catalogIndexVersion,
        documentCount: Number.isFinite(documentCount) ? documentCount : 0,
        lastFreshnessAt: lastFreshnessAt ?? null,
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to read catalog health stats from Redis');
      return {
        enabled: config.enableCatalogSearch,
        ready: false,
        indexVersion: config.catalogIndexVersion,
        documentCount: 0,
        lastFreshnessAt: null,
      };
    }
  }

  async recordServed(params: { lang: CatalogLanguage; region?: string; foodIds: string[] }): Promise<void> {
    const client = getRedisClient();
    if (!client || params.foodIds.length === 0) return;

    const generation = await this.getActiveGeneration();
    const regionKey = catalogFoodPopularityKey(params.lang, params.region ?? 'GLOBAL', generation);
    const globalKey = catalogFoodPopularityKey(params.lang, 'GLOBAL', generation);
    const pipeline = client.pipeline();
    params.foodIds.forEach((foodId) => {
      pipeline.zincrby(regionKey, SERVED_POPULARITY_INCREMENT, foodId);
      if (globalKey !== regionKey) {
        pipeline.zincrby(globalKey, SERVED_POPULARITY_INCREMENT, foodId);
      }
    });
    const result = await pipeline.exec();
    if (result?.some(([error]) => error)) {
      throw new Error('Failed to persist served popularity signal');
    }
  }

  async recordClicked(params: { lang: CatalogLanguage; region?: string; foodId: string }): Promise<void> {
    const client = getRedisClient();
    if (!client) return;

    const generation = await this.getActiveGeneration();
    const regionKey = catalogFoodPopularityKey(params.lang, params.region ?? 'GLOBAL', generation);
    const globalKey = catalogFoodPopularityKey(params.lang, 'GLOBAL', generation);
    const pipeline = client.pipeline();
    pipeline.zincrby(regionKey, CLICK_POPULARITY_INCREMENT, params.foodId);
    if (globalKey !== regionKey) {
      pipeline.zincrby(globalKey, CLICK_POPULARITY_INCREMENT, params.foodId);
    }
    const result = await pipeline.exec();
    if (result?.some(([error]) => error)) {
      throw new Error('Failed to persist clicked popularity signal');
    }
  }

  private async getItemsByIds(lang: CatalogLanguage, ids: string[]): Promise<CatalogFoodItem[]> {
    const docsById = await this.getDocsById(ids);
    return ids
      .map((id) => docsById.get(id))
      .filter((doc): doc is CatalogFoodDocument => !!doc)
      .map((doc) => toCatalogFoodItem(doc, lang))
      .filter((item): item is CatalogFoodItem => item !== null);
  }

  private async getDocsById(ids: string[]): Promise<Map<string, CatalogFoodDocument>> {
    if (ids.length === 0) return new Map();
    const client = getRedisClient();
    if (!client) return new Map();

    const keys = ids.map((id) => catalogFoodDocumentKey(id));
    const rawDocs = await client.mget(keys);
    const docsById = new Map<string, CatalogFoodDocument>();
    rawDocs.forEach((rawDoc, index) => {
      if (!rawDoc) return;
      const doc = safeJsonParse<CatalogFoodDocument>(rawDoc);
      const id = ids[index];
      if (!doc || !id) return;
      docsById.set(id, doc);
    });
    return docsById;
  }

  private async findTypoCandidateTokens(
    lang: CatalogLanguage,
    generation: string,
    queryTokens: string[],
  ): Promise<Map<string, Set<string>>> {
    const client = getRedisClient();
    const result = new Map<string, Set<string>>();
    if (!client) return result;

    const dictionaryKey = catalogLanguageTokenSetKey(lang, generation);
    const allTokens = await client.smembers(dictionaryKey);

    queryTokens.forEach((queryToken) => {
      const candidates = allTokens
        .filter((token) => {
          if (Math.abs(token.length - queryToken.length) > config.catalogTypoMaxDistance) return false;
          if (token === queryToken) return false;
          return levenshteinDistance(token, queryToken) <= config.catalogTypoMaxDistance;
        })
        .slice(0, MAX_TYPO_TOKENS_PER_QUERY_TOKEN);
      result.set(queryToken, new Set(candidates));
    });

    return result;
  }

  private async rankCandidates(params: {
    lang: CatalogLanguage;
    queryTokens: string[];
    region?: string;
    generation: string;
    docsById: Map<string, CatalogFoodDocument>;
    synonymTokensByQueryToken: Map<string, Set<string>>;
    typoTokensByQueryToken: Map<string, Set<string>>;
  }): Promise<Array<{ item: CatalogFoodItem; score: number }>> {
    const client = getRedisClient();
    if (!client) return [];

    const ids = Array.from(params.docsById.keys());
    const popularityKey = catalogFoodPopularityKey(params.lang, params.region ?? 'GLOBAL', params.generation);
    const globalKey = catalogFoodPopularityKey(params.lang, 'GLOBAL', params.generation);

    const popularityPipeline = client.pipeline();
    ids.forEach((id) => {
      popularityPipeline.zscore(popularityKey, id);
      if (globalKey !== popularityKey) {
        popularityPipeline.zscore(globalKey, id);
      }
    });
    const popularityResult = await popularityPipeline.exec();

    let popularityIndex = 0;
    const popularityById = new Map<string, number>();
    ids.forEach((id) => {
      const regionScoreRaw = popularityResult?.[popularityIndex]?.[1];
      popularityIndex += 1;
      const globalScoreRaw = globalKey !== popularityKey ? popularityResult?.[popularityIndex]?.[1] : null;
      if (globalKey !== popularityKey) popularityIndex += 1;
      const regionScore = Number.parseFloat(String(regionScoreRaw ?? '0')) || 0;
      const globalScore = Number.parseFloat(String(globalScoreRaw ?? '0')) || 0;
      popularityById.set(id, regionScore + globalScore);
    });

    const ranked: Array<{ item: CatalogFoodItem; score: number }> = [];
    params.docsById.forEach((doc, id) => {
      const item = toCatalogFoodItem(doc, params.lang);
      if (!item) return;
      const tokens = tokenize(item.name);
      if (tokens.length === 0) return;

      const exactMatch = params.queryTokens.every((queryToken) => tokens.includes(queryToken));
      const prefixMatch = params.queryTokens.every((queryToken) => tokens.some((token) => token.startsWith(queryToken)));
      const synonymMatch = params.queryTokens.every((queryToken) => {
        const synonyms = params.synonymTokensByQueryToken.get(queryToken);
        return !!synonyms && tokens.some((token) => synonyms.has(token));
      });
      const typoMatch = params.queryTokens.every((queryToken) => {
        const typoTokens = params.typoTokensByQueryToken.get(queryToken);
        return !!typoTokens && tokens.some((token) => typoTokens.has(token));
      });

      let tier: keyof typeof TIER_WEIGHT | null = null;
      if (exactMatch) {
        tier = 'exact';
      } else if (prefixMatch) {
        tier = 'prefix';
      } else if (synonymMatch) {
        tier = 'synonym';
      } else if (typoMatch) {
        tier = 'typo';
      }
      if (!tier) return;

      const reviewStatus = doc.localized?.[params.lang]?.reviewStatus;
      const reviewedBoost = reviewStatus === 'reviewed' ? 25 : 0;
      const popularityBoost = popularityById.get(id) ?? 0;
      const score = TIER_WEIGHT[tier] + popularityBoost + reviewedBoost;
      ranked.push({ item, score });
    });

    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.name.localeCompare(b.item.name);
    });
    return ranked;
  }

  private async getActiveGeneration(): Promise<string> {
    const client = getRedisClient();
    if (!client) return 'a';
    const raw = await client.get(catalogActiveGenerationKey());
    return raw === 'b' ? 'b' : 'a';
  }
}
