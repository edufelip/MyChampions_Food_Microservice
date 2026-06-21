import { createHash } from 'node:crypto';
import { getRedisClient } from '../cache/redis-client';
import { config } from '../config';
import { logger } from '../logger';

const CACHE_VERSION = 'v1';

export interface TranslationCacheRepository {
  getQueryTranslation(sourceLanguage: string, targetLanguage: string, query: string): Promise<string | null>;
  setQueryTranslation(sourceLanguage: string, targetLanguage: string, query: string, translatedQuery: string): Promise<void>;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function queryHash(query: string): string {
  return createHash('sha1').update(normalizeQuery(query)).digest('hex');
}



function queryTranslationKey(sourceLanguage: string, targetLanguage: string, query: string): string {
  return `query_tr:${CACHE_VERSION}:${sourceLanguage}:${targetLanguage}:${queryHash(query)}`;
}

export class RedisTranslationCacheRepository implements TranslationCacheRepository {


  async getQueryTranslation(
    sourceLanguage: string,
    targetLanguage: string,
    query: string,
  ): Promise<string | null> {
    const client = getRedisClient();
    if (!client) return null;

    try {
      return await client.get(queryTranslationKey(sourceLanguage, targetLanguage, query));
    } catch (error) {
      logger.warn({ error, sourceLanguage, targetLanguage }, 'Failed to read query translation from Redis');
      return null;
    }
  }

  async setQueryTranslation(
    sourceLanguage: string,
    targetLanguage: string,
    query: string,
    translatedQuery: string,
  ): Promise<void> {
    const client = getRedisClient();
    if (!client) return;

    try {
      await client.set(
        queryTranslationKey(sourceLanguage, targetLanguage, query),
        translatedQuery,
        'EX',
        config.queryTranslationCacheTtlSeconds,
      );
    } catch (error) {
      logger.warn({ error, sourceLanguage, targetLanguage }, 'Failed to write query translation to Redis');
    }
  }
}
