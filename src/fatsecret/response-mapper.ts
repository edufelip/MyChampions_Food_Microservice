/**
 * Mapping of raw FatSecret API food item objects to a normalized shape.
 *
 * The client app receives `results` as an array; we preserve the upstream
 * payload without stripping fields so the mobile client can evolve its
 * consumption without server-side changes.
 */

export type FatSecretFoodItem = Record<string, unknown>;

/**
 * Extracts the array of food items from the FatSecret foods.search response.
 * Handles both the array case (multiple results) and the object case
 * (exactly one result – FatSecret quirk).
 */
export function mapFatSecretResponse(data: unknown): FatSecretFoodItem[] {
  if (!data || typeof data !== 'object') return [];

  const root = data as Record<string, unknown>;
  const foods = root['foods'];

  if (!foods || typeof foods !== 'object') return [];

  const foodsObj = foods as Record<string, unknown>;
  const food = foodsObj['food'];

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
