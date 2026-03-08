/**
 * Mapping of raw FatSecret API food item objects to a normalized shape.
 *
 * The client app receives `results` as an array; we preserve the upstream
 * payload without stripping fields so the mobile client can evolve its
 * consumption without server-side changes.
 */

export type FatSecretFoodItem = Record<string, unknown>;

function toArray(food: unknown): FatSecretFoodItem[] {
  if (!food) return [];

  // FatSecret returns a single object when there is exactly one result
  if (Array.isArray(food)) {
    return food as FatSecretFoodItem[];
  }
  if (typeof food === 'object') {
    return [food as FatSecretFoodItem];
  }

  return [];
}

/**
 * Extracts the array of food items from the FatSecret foods.search response.
 * Handles both the array case (multiple results) and the object case
 * (exactly one result – FatSecret quirk).
 *
 * The API has appeared in two compatible payload variants:
 * 1) `foods_search.results.food` (legacy Firebase function implementation)
 * 2) `foods.food` (newer documented REST response wrappers)
 * We support both for robustness.
 */
export function mapFatSecretResponse(data: unknown): FatSecretFoodItem[] {
  if (!data || typeof data !== 'object') return [];

  const root = data as Record<string, unknown>;
  const foodsSearch = root['foods_search'] as Record<string, unknown> | undefined;
  const foodsSearchResults = foodsSearch?.['results'] as Record<string, unknown> | undefined;
  const legacyFood = foodsSearchResults?.['food'];
  const legacyArray = toArray(legacyFood);
  if (legacyArray.length > 0) {
    return legacyArray;
  }

  const foods = root['foods'];
  if (!foods || typeof foods !== 'object') return [];

  const foodsObj = foods as Record<string, unknown>;
  return toArray(foodsObj['food']);
}
