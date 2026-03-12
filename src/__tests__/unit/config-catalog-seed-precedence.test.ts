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

  it('uses env override when CATALOG_SYNC_SEED_QUERIES has at least 50 entries', () => {
    process.env.CATALOG_SYNC_SEED_QUERIES = Array.from({ length: 50 }, (_, index) => `food-${index + 1}`).join(', ');
    jest.resetModules();
    const { config } = require('../../config') as typeof import('../../config');

    expect(config.catalogSyncSeedQueries).toHaveLength(50);
    expect(config.catalogSyncSeedQueries[0]).toBe('food-1');
    expect(config.catalogSyncSeedQueries[49]).toBe('food-50');
  });

  it('throws when CATALOG_SYNC_SEED_QUERIES has less than 50 entries', () => {
    process.env.CATALOG_SYNC_SEED_QUERIES = 'rice, beans, oats';
    jest.resetModules();

    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../../config');
    }).toThrow('CATALOG_SYNC_SEED_QUERIES must include at least 50 entries');
  });
});
