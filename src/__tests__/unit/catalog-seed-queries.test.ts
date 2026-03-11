import { DEFAULT_CATALOG_SEED_QUERIES } from '../../catalog/seeds/default-seed-queries';

describe('default catalog seed queries', () => {
  it('contains exactly 80 unique non-empty entries', () => {
    expect(DEFAULT_CATALOG_SEED_QUERIES).toHaveLength(80);

    const normalized = DEFAULT_CATALOG_SEED_QUERIES.map((item) => item.trim().toLowerCase());
    expect(normalized.every((item) => item.length > 0)).toBe(true);
    expect(new Set(normalized).size).toBe(80);
  });

  it('contains representative foods from carbs, proteins, fats, and vegetables', () => {
    expect(DEFAULT_CATALOG_SEED_QUERIES).toEqual(
      expect.arrayContaining([
        'brown rice',
        'chicken breast',
        'extra virgin olive oil',
        'broccoli',
      ]),
    );
  });
});
