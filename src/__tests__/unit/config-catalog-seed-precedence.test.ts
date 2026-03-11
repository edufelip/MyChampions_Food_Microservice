describe('config catalog seed precedence', () => {
  const originalOverride = process.env.CATALOG_SYNC_SEED_QUERIES;

  afterEach(() => {
    if (originalOverride === undefined) {
      delete process.env.CATALOG_SYNC_SEED_QUERIES;
    } else {
      process.env.CATALOG_SYNC_SEED_QUERIES = originalOverride;
    }
    jest.resetModules();
  });

  it('uses JSON defaults when CATALOG_SYNC_SEED_QUERIES is not provided', () => {
    delete process.env.CATALOG_SYNC_SEED_QUERIES;
    jest.resetModules();
    const { config } = require('../../config') as typeof import('../../config');

    expect(config.catalogSyncSeedQueries).toHaveLength(80);
    expect(config.catalogSyncSeedQueries).toEqual(expect.arrayContaining(['brown rice', 'broccoli']));
  });

  it('uses env override when CATALOG_SYNC_SEED_QUERIES is provided', () => {
    process.env.CATALOG_SYNC_SEED_QUERIES = 'rice, beans , oats';
    jest.resetModules();
    const { config } = require('../../config') as typeof import('../../config');

    expect(config.catalogSyncSeedQueries).toEqual(['rice', 'beans', 'oats']);
  });
});
