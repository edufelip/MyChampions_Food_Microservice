import { config } from '../../../config';
import { logger } from '../../../logger';
import { CatalogProviderPort } from '../../domain/catalog-ports';
import { rebuildRedisCatalogFromPostgres } from './rebuild-redis-catalog-from-postgres';

export class PostgresBackedCatalogProviderRepository implements CatalogProviderPort {
  private activeRestorePromise: Promise<boolean> | null = null;

  constructor(private readonly delegate: CatalogProviderPort) {}

  private isRestoreConfigured(): boolean {
    return Boolean(config.catalogPostgresRestoreOnMiss && config.postgresUrl && config.redisUrl);
  }

  private async restoreCacheFromPostgres(reason: string): Promise<boolean> {
    if (!this.isRestoreConfigured()) {
      return false;
    }

    if (!this.activeRestorePromise) {
      this.activeRestorePromise = (async () => {
        logger.warn({ reason }, 'Food Redis catalog unavailable; restoring cache from Postgres source');
        const result = await rebuildRedisCatalogFromPostgres({
          redisUrl: config.redisUrl,
          postgresUrl: config.postgresUrl as string,
          replaceExisting: true,
        });
        logger.info(
          {
            reason,
            deletedRedisKeyCount: result.deletedRedisKeyCount,
            restoredRedisKeyCount: result.restoredRedisKeyCount,
          },
          'Food Redis catalog restored from Postgres source',
        );
        return true;
      })().finally(() => {
        this.activeRestorePromise = null;
      });
    }

    return this.activeRestorePromise;
  }

  private async ensureCacheReady(reason: string): Promise<void> {
    const health = await this.delegate.getHealth();
    if (health.ready) {
      return;
    }

    await this.restoreCacheFromPostgres(reason);
  }

  async searchByPrefix(params: Parameters<CatalogProviderPort['searchByPrefix']>[0]) {
    await this.ensureCacheReady('searchByPrefix');
    return this.delegate.searchByPrefix(params);
  }

  async getPopular(params: Parameters<CatalogProviderPort['getPopular']>[0]) {
    await this.ensureCacheReady('getPopular');
    return this.delegate.getPopular(params);
  }

  async getHealth() {
    const health = await this.delegate.getHealth();
    if (health.ready) {
      return health;
    }

    if (await this.restoreCacheFromPostgres('getHealth')) {
      return this.delegate.getHealth();
    }

    return health;
  }

  async recordServed(params: Parameters<CatalogProviderPort['recordServed']>[0]) {
    return this.delegate.recordServed(params);
  }

  async recordClicked(params: Parameters<CatalogProviderPort['recordClicked']>[0]) {
    return this.delegate.recordClicked(params);
  }
}
