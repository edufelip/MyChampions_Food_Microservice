import rawTopDietFoodSeeds from './top-diet-food-seeds.json';

const EXPECTED_DEFAULT_SEED_COUNT = 80;

function normalizeSeed(value: string): string {
  return value.trim().toLowerCase();
}

function validateAndBuildDefaultSeeds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new Error('Invalid top-diet-food-seeds.json: expected an array');
  }

  const seeds = raw.map((item, index) => {
    if (typeof item !== 'string') {
      throw new Error(`Invalid top-diet-food-seeds.json: item at index ${index} must be a string`);
    }
    const normalized = item.trim();
    if (normalized.length === 0) {
      throw new Error(`Invalid top-diet-food-seeds.json: item at index ${index} must be non-empty`);
    }
    return normalized;
  });

  if (seeds.length !== EXPECTED_DEFAULT_SEED_COUNT) {
    throw new Error(
      `Invalid top-diet-food-seeds.json: expected ${EXPECTED_DEFAULT_SEED_COUNT} entries, got ${seeds.length}`,
    );
  }

  const deduped = new Set<string>();
  seeds.forEach((seed) => {
    const key = normalizeSeed(seed);
    if (deduped.has(key)) {
      throw new Error(`Invalid top-diet-food-seeds.json: duplicated seed "${seed}"`);
    }
    deduped.add(key);
  });

  return seeds;
}

export const DEFAULT_CATALOG_SEED_QUERIES = validateAndBuildDefaultSeeds(rawTopDietFoodSeeds);

export const TOP_DIET_FOOD_SEEDS_FILE = 'src/catalog/seeds/top-diet-food-seeds.json';
