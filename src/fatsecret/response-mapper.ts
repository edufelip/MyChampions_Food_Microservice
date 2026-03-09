/**
 * Mapping of raw FatSecret API food items into normalized 100g nutrition rows.
 */
interface FatSecretServing {
  metric_serving_amount?: string | number;
  metric_serving_unit?: string;
  carbohydrate?: string | number;
  protein?: string | number;
  fat?: string | number;
}

interface FatSecretFoodRaw {
  food_id?: string | number;
  food_name?: string;
  food_description?: string;
  servings?: {
    serving?: FatSecretServing | FatSecretServing[];
  };
}

export interface FatSecretFoodItem {
  id: string;
  name: string;
  carbohydrate: number;
  protein: number;
  fat: number;
  serving: number;
}

function toArray<T>(value: unknown): T[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value as T[];
  }
  if (typeof value === 'object') {
    return [value as T];
  }
  return [];
}

function parseDecimal(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseLocaleDecimal(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (normalized.length === 0) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchMacro(description: string, pattern: RegExp): number | null {
  const matched = description.match(pattern);
  if (!matched || !matched[1]) return null;
  return parseLocaleDecimal(matched[1]);
}

function parseNutritionFromDescription(description: string): {
  grams: number;
  carbohydrate: number;
  protein: number;
  fat: number;
} | null {
  const gramsMatch = description.match(/Per\s+([\d.,]+)\s*g\b/i);
  if (!gramsMatch || !gramsMatch[1]) return null;

  const grams = parseLocaleDecimal(gramsMatch[1]);
  const carbohydrate = matchMacro(description, /(?:Carbs?|Carbohydrate):\s*([\d.,]+)\s*g/i);
  const protein = matchMacro(description, /Protein:\s*([\d.,]+)\s*g/i);
  const fat = matchMacro(description, /Fat:\s*([\d.,]+)\s*g/i);

  if (
    grams === null ||
    grams <= 0 ||
    carbohydrate === null ||
    protein === null ||
    fat === null
  ) {
    return null;
  }

  return { grams, carbohydrate, protein, fat };
}

function extractFoods(root: Record<string, unknown>): FatSecretFoodRaw[] {
  const foods = root['foods'];
  if (!foods || typeof foods !== 'object') return [];
  return toArray<FatSecretFoodRaw>((foods as Record<string, unknown>)['food']);
}

function mapOneFood(raw: FatSecretFoodRaw): FatSecretFoodItem | null {
  const idRaw = raw.food_id;
  const nameRaw = raw.food_name;
  if ((typeof idRaw !== 'string' && typeof idRaw !== 'number') || typeof nameRaw !== 'string' || nameRaw.trim().length === 0) {
    return null;
  }

  const servings = toArray<FatSecretServing>(raw.servings?.serving);
  const gramServing = servings.find((serving) => {
    if (serving.metric_serving_unit !== 'g') return false;

    const servingAmount = parseDecimal(serving.metric_serving_amount);
    const carbohydrate = parseDecimal(serving.carbohydrate);
    const protein = parseDecimal(serving.protein);
    const fat = parseDecimal(serving.fat);

    return (
      servingAmount !== null &&
      servingAmount > 0 &&
      carbohydrate !== null &&
      protein !== null &&
      fat !== null
    );
  });

  if (gramServing) {
    const servingAmount = parseDecimal(gramServing.metric_serving_amount) as number;
    const carbohydrate = parseDecimal(gramServing.carbohydrate) as number;
    const protein = parseDecimal(gramServing.protein) as number;
    const fat = parseDecimal(gramServing.fat) as number;

    return {
      id: String(idRaw),
      name: nameRaw.trim(),
      carbohydrate: roundTo2((carbohydrate / servingAmount) * 100),
      protein: roundTo2((protein / servingAmount) * 100),
      fat: roundTo2((fat / servingAmount) * 100),
      serving: 100,
    };
  }

  const description = typeof raw.food_description === 'string' ? raw.food_description : '';
  const fallback = parseNutritionFromDescription(description);
  if (!fallback) return null;

  return {
    id: String(idRaw),
    name: nameRaw.trim(),
    carbohydrate: roundTo2((fallback.carbohydrate / fallback.grams) * 100),
    protein: roundTo2((fallback.protein / fallback.grams) * 100),
    fat: roundTo2((fallback.fat / fallback.grams) * 100),
    serving: 100,
  };
}

/**
 * Extracts normalized foods from FatSecret foods.search response.
 * Results without a valid gram-based serving are dropped.
 */
export function mapFatSecretResponse(data: unknown): FatSecretFoodItem[] {
  if (!data || typeof data !== 'object') return [];

  const root = data as Record<string, unknown>;
  const foods = extractFoods(root);
  return foods
    .map(mapOneFood)
    .filter((item): item is FatSecretFoodItem => item !== null);
}
