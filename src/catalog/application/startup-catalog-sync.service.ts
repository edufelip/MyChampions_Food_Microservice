import { config } from '../../config';
import { logger } from '../../logger';
import { incrementCounter } from '../../metrics';
import { CatalogProviderPort } from '../domain/catalog-ports';
import { RedisCatalogProviderRepository } from '../infrastructure/redis/redis-catalog-provider.repository';
import { syncFoodCatalog } from './sync-food-catalog.service';

interface StartupCatalogSyncDeps {
  provider: Pick<CatalogProviderPort, 'getHealth'>;
  syncCatalog: () => Promise<unknown>;
  now: () => number;
  enabled: boolean;
  cooldownMs: number;
}

export function createStartupCatalogSyncService(
  deps: StartupCatalogSyncDeps,
): (reason?: string) => Promise<void> {
  let inFlight: Promise<void> | null = null;
  let lastAttemptAt = 0;

  return async (reason = 'startup'): Promise<void> => {
    if (!deps.enabled) {
      incrementCounter('catalog.startup_sync_disabled');
      return;
    }

    if (inFlight) {
      incrementCounter('catalog.startup_sync_skipped_inflight');
      return inFlight;
    }

    const now = deps.now();
    const withinCooldown = lastAttemptAt > 0 && now - lastAttemptAt < deps.cooldownMs;
    if (withinCooldown) {
      incrementCounter('catalog.startup_sync_skipped_cooldown');
      logger.info({ reason, cooldownMs: deps.cooldownMs }, 'Skipping catalog startup sync because cooldown is active');
      return;
    }
    lastAttemptAt = now;

    inFlight = (async () => {
      incrementCounter('catalog.startup_sync_attempted');
      let shouldSync = true;

      try {
        const health = await deps.provider.getHealth();
        if (health.ready && health.documentCount > 0) {
          shouldSync = false;
          incrementCounter('catalog.startup_sync_skipped_ready');
          logger.info(
            {
              reason,
              indexVersion: health.indexVersion,
              documentCount: health.documentCount,
              lastFreshnessAt: health.lastFreshnessAt,
            },
            'Catalog is ready on startup; skipping sync',
          );
        }
      } catch (error) {
        incrementCounter('catalog.startup_sync_health_check_failed');
        logger.warn({ error, reason }, 'Failed to read catalog health before startup sync; continuing with sync attempt');
      }

      if (!shouldSync) {
        return;
      }

      try {
        const result = await deps.syncCatalog();
        incrementCounter('catalog.startup_sync_success');
        logger.info({ reason, result }, 'Catalog startup sync completed');
      } catch (error) {
        incrementCounter('catalog.startup_sync_failure');
        logger.error({ error, reason }, 'Catalog startup sync failed');
      }
    })().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}

const defaultStartupCatalogSync = createStartupCatalogSyncService({
  provider: new RedisCatalogProviderRepository(),
  syncCatalog: () => syncFoodCatalog(),
  now: () => Date.now(),
  enabled: config.enableStartupCatalogSync,
  cooldownMs: config.startupCatalogSyncCooldownMs,
});

export const runCatalogStartupSync = defaultStartupCatalogSync;
