import {
  findNumericCandidates,
  normalizeTo100,
  parseFixedPoint,
  withinNutritionBounds,
} from '../../../catalog/recovery/numeric-spans';

describe('nutrition recovery numeric spans', () => {
  it('uses fixed-point half-up arithmetic for 100g normalization', () => {
    expect(normalizeTo100(16_000, 4_450)).toBe('27.81');
  });

  it('accepts locale decimal conventions and rejects the other separator', () => {
    expect(parseFixedPoint('12,50', 'pt-BR')).toEqual({ hundredths: 1_250, decimal: '12.50' });
    expect(parseFixedPoint('12.50', 'en-US')).toEqual({ hundredths: 1_250, decimal: '12.50' });
    expect(parseFixedPoint('12.50', 'pt-BR')).toBeNull();
  });

  it.each([
    'Per 100g: Fat: -5g | Carbs: 5g | Protein: 3g',
    'Per 100g: Fat: 5–8g | Carbs: 5g | Protein: 3g',
    'Per 100g: Fat: 1/2g | Carbs: 5g | Protein: 3g',
    'Per 100g: Fat: 1e3g | Carbs: 5g | Protein: 3g',
    'Per 100g: Fat: 1,234.56g | Carbs: 5g | Protein: 3g',
    'Per 100g: Fat: 1.23.45g | Carbs: 5g | Protein: 3g',
  ])('rejects unsupported numeric expression without leaking fragments: %s', (description) => {
    const scan = findNumericCandidates(description, 'en-US', 0, description.length, 'panel-0');
    expect(scan.unsupported).toBe(true);
  });

  it('enforces mass, macro, and aggregate bounds without clamping', () => {
    expect(withinNutritionBounds(10_000, { carbohydrate: 5_000, protein: 2_000, fat: 1_000 })).toBe(true);
    expect(withinNutritionBounds(10_000, { carbohydrate: 10_001, protein: 0, fat: 0 })).toBe(false);
    expect(withinNutritionBounds(10_000, { carbohydrate: 5_000, protein: 4_000, fat: 2_000 })).toBe(false);
  });
});
