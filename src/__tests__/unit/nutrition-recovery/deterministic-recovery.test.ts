import { analyzeDescription, validateSelection } from '../../../catalog/recovery/deterministic-recovery';
import { recoverDescription } from '../../../catalog/recovery/recover-description';
import { TypesafeResponse } from '../../../catalog/recovery/recovery-types';
import { validateRecoveryInput } from '../../../catalog/recovery/source-validation';

function source(sourceId: string, locale: 'en-US' | 'pt-BR' | 'es-ES', description: string) {
  const validation = validateRecoveryInput({
    schemaVersion: 'nutrition-recovery-input.v1',
    sourceId,
    locale,
    food: { food_id: sourceId, food_name: sourceId, food_description: description },
  });
  if (!validation.ok) throw new Error(validation.message);
  return validation.source;
}

function modelResponse(overrides: Partial<TypesafeResponse['answers']> = {}): TypesafeResponse {
  return {
    model: 'jev-1.13.0',
    answers: {
      grams: { type: 'choice', choice: 'v0', confidence: 0.99 },
      carbohydrate: { type: 'choice', choice: 'v1', confidence: 0.99 },
      protein: { type: 'choice', choice: 'v2', confidence: 0.99 },
      fat: { type: 'choice', choice: 'v3', confidence: 0.99 },
      ...overrides,
    },
    usage: { input_tokens: 12, output_tokens: 4 },
  };
}

describe('deterministic nutrition recovery', () => {
  it('recovers Spanish labels and normalizes with exact arithmetic', async () => {
    const result = await recoverDescription(
      source('es', 'es-ES', 'Porción de 80 g: grasas 2 g, proteínas 6 g, carbohidratos 24 g'),
      { runId: 'test' },
    );
    expect(result).toMatchObject({ status: 'suggested', method: 'deterministic', reason: 'complete_proposal' });
    expect(result.normalized100g).toEqual({ carbohydrate: '30.00', protein: '7.50', fat: '2.50', serving: '100' });
  });

  it('rejects Portuguese saturated fat as total fat', () => {
    const analysis = analyzeDescription(
      'Por 100g: gorduras saturadas 2g; carboidratos 5g; proteínas 3g',
      'pt-BR',
    );
    expect(analysis.ok).toBe(true);
    if (analysis.ok) expect(analysis.analysis.missingFields).toContain('fat');
  });

  it('rejects a second serving header even when its unit differs', () => {
    const result = analyzeDescription(
      'Per 100g: Fat: 2g | Carbs: 5g | Protein: 3g. Per 100ml: Fat: 1g',
      'en-US',
    );
    expect(result).toEqual({ ok: false, reason: 'multiple_panels' });
  });

  it('keeps model selections inside the admissible role for each field', () => {
    const analysis = analyzeDescription(
      'Per 100g: Fat: 2g | Saturated fat: 1g | Sugar: 3g | Carbs: 5g | Protein: 4g',
      'en-US',
    );
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    expect(validateSelection(analysis.analysis, {
      grams: 'v0', carbohydrate: 'v2', protein: 'v4', fat: 'v1',
    })).toMatchObject({ ok: false, reason: 'invalid_model_response' });
  });

  it('does not call recovery on an existing accepted row', async () => {
    const result = await recoverDescription(source(
      'existing',
      'en-US',
      'Per 100g: Fat: 2g | Carbs: 5g | Protein: 3g',
    ), {
      runId: 'test',
      client: { choose: jest.fn() },
    });
    expect(result).toMatchObject({ status: 'already_accepted', method: 'existing' });
  });

  it('retains provider usage when the model abstains', async () => {
    const result = await recoverDescription(source(
      'missing-fat',
      'pt-BR',
      'Por 100g: carboidratos 5g; proteínas 3g; gorduras saturadas 2g',
    ), {
      runId: 'test',
      client: { choose: async () => ({ response: modelResponse({ fat: { type: 'choice', choice: 'none', confidence: 0.96 } }), latencyMs: 7 }) },
    });
    expect(result).toMatchObject({ status: 'abstained', reason: 'no_selection', method: 'typesafe', usage: { inputTokens: 12, outputTokens: 4 } });
  });

  it('retains provider usage when confidence is below the activation threshold', async () => {
    const result = await recoverDescription(source(
      'ambiguous-protein',
      'pt-BR',
      'Por 100g: carboidratos 5g; proteínas 3g; proteínas 4g; gorduras 2g',
    ), {
      runId: 'test',
      client: { choose: async () => ({
        response: modelResponse({ protein: { type: 'choice', choice: 'v2', confidence: 0.4 }, fat: { type: 'choice', choice: 'v4', confidence: 0.99 } }),
        latencyMs: 8,
      }) },
    });
    expect(result).toMatchObject({ status: 'abstained', reason: 'low_confidence', method: 'typesafe', usage: { inputTokens: 12, outputTokens: 4 } });
  });
});
