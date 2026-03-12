import { createStartupCatalogSyncService } from '../../catalog/application/startup-catalog-sync.service';
import { getCounter, resetCounters } from '../../metrics';

describe('startup-catalog-sync.service', () => {
  beforeEach(() => {
    resetCounters();
  });

  it('runs sync when catalog is not ready', async () => {
    const syncCatalog = jest.fn().mockResolvedValue({ upsertedDocuments: 20 });
    const service = createStartupCatalogSyncService({
      provider: {
        getHealth: jest.fn().mockResolvedValue({
          enabled: true,
          ready: false,
          indexVersion: 'v1',
          documentCount: 0,
          lastFreshnessAt: null,
        }),
      },
      syncCatalog,
      now: () => 1_000,
      enabled: true,
      cooldownMs: 30_000,
    });

    await service('startup');

    expect(syncCatalog).toHaveBeenCalledTimes(1);
    expect(getCounter('catalog.startup_sync_attempted')).toBe(1);
    expect(getCounter('catalog.startup_sync_success')).toBe(1);
    expect(getCounter('catalog.startup_sync_skipped_ready')).toBe(0);
  });

  it('skips sync when catalog is already ready', async () => {
    const syncCatalog = jest.fn().mockResolvedValue({ upsertedDocuments: 20 });
    const service = createStartupCatalogSyncService({
      provider: {
        getHealth: jest.fn().mockResolvedValue({
          enabled: true,
          ready: true,
          indexVersion: 'v1',
          documentCount: 100,
          lastFreshnessAt: '2026-03-12T00:00:00.000Z',
        }),
      },
      syncCatalog,
      now: () => 1_000,
      enabled: true,
      cooldownMs: 30_000,
    });

    await service('startup');

    expect(syncCatalog).not.toHaveBeenCalled();
    expect(getCounter('catalog.startup_sync_skipped_ready')).toBe(1);
    expect(getCounter('catalog.startup_sync_success')).toBe(0);
  });

  it('deduplicates concurrent calls while sync is in flight', async () => {
    let resolveSync: () => void = () => {};
    const syncCatalog = jest.fn().mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveSync = resolve;
      }),
    );

    const service = createStartupCatalogSyncService({
      provider: {
        getHealth: jest.fn().mockResolvedValue({
          enabled: true,
          ready: false,
          indexVersion: 'v1',
          documentCount: 0,
          lastFreshnessAt: null,
        }),
      },
      syncCatalog,
      now: () => 1_000,
      enabled: true,
      cooldownMs: 30_000,
    });

    const first = service('startup');
    const second = service('startup');
    await Promise.resolve();
    expect(syncCatalog).toHaveBeenCalledTimes(1);
    expect(getCounter('catalog.startup_sync_skipped_inflight')).toBe(1);

    resolveSync();
    await Promise.all([first, second]);
  });
});
