import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recoverDescription } from '../../../catalog/recovery/recover-description';
import { appendReviewDecision, createRunDirectory, exportReviewedProposals, readJsonLines, renderReport, writeJsonLines } from '../../../catalog/recovery/review-store';
import { RecoveryInputV1 } from '../../../catalog/recovery/recovery-types';
import { validateRecoveryInput } from '../../../catalog/recovery/source-validation';

async function setupRun() {
  const root = await mkdtemp(join(tmpdir(), 'nutrition-recovery-test-'));
  const run = join(root, 'run');
  await createRunDirectory(run);
  const input: RecoveryInputV1 = {
    schemaVersion: 'nutrition-recovery-input.v1',
    sourceId: 'review-1',
    locale: 'pt-BR',
    food: { food_id: 'review-1', food_name: 'Review', food_description: 'Por 100g: gorduras 2g; carboidratos 5g; proteínas 3g' },
  };
  const validation = validateRecoveryInput(input);
  if (!validation.ok) throw new Error(validation.message);
  const result = await recoverDescription(validation.source, { runId: 'run' });
  await writeJsonLines(join(run, 'inputs.jsonl'), [validation.source]);
  await writeJsonLines(join(run, 'results.jsonl'), [result]);
  await writeJsonLines(join(run, 'decisions.jsonl'), []);
  return { run, input: validation.source, result };
}

describe('hash-bound local review store', () => {
  it('accepts, supersedes, and exports only the latest accepted decision', async () => {
    const { run, result } = await setupRun();
    const base = { sourceId: 'review-1', sourceHash: result.sourceHash, suggestionHash: result.suggestionHash as string, reviewer: 'qa', decidedAt: '2026-09-26T00:00:00.000Z' };
    const accepted = await appendReviewDecision(run, { ...base, decision: 'accept', note: 'first' });
    const rejected = await appendReviewDecision(run, { ...base, decision: 'reject', note: 'needs review', supersedes: accepted.decisionId, decidedAt: '2026-09-26T00:01:00.000Z' });
    const acceptedAgain = await appendReviewDecision(run, { ...base, decision: 'accept', note: 'verified', supersedes: rejected.decisionId, decidedAt: '2026-09-26T00:02:00.000Z' });
    const output = join(run, 'reviewed.jsonl');
    const proposals = await exportReviewedProposals(run, output);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.review.decisionId).toBe(acceptedAgain.decisionId);
    expect((await readJsonLines(output)).length).toBe(1);
  });

  it('rejects a stale supersedes pointer and keeps history unchanged', async () => {
    const { run, result } = await setupRun();
    const base = { sourceId: 'review-1', sourceHash: result.sourceHash, suggestionHash: result.suggestionHash as string, reviewer: 'qa' };
    const accepted = await appendReviewDecision(run, { ...base, decision: 'accept', note: 'first', decidedAt: '2026-09-26T00:00:00.000Z' });
    await expect(appendReviewDecision(run, { ...base, decision: 'reject', note: 'second', supersedes: 'stale', decidedAt: '2026-09-26T00:01:00.000Z' })).rejects.toThrow('supersedes');
    const decisions = await readJsonLines<{ decisionId: string }>(join(run, 'decisions.jsonl'));
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.decisionId).toBe(accepted.decisionId);
  });

  it('refuses tampered source content and never exports it', async () => {
    const { run, result, input } = await setupRun();
    const tampered = { ...input, food: { ...input.food, food_description: 'Por 100g: gorduras 99g; carboidratos 0g; proteínas 0g' } };
    await writeJsonLines(join(run, 'inputs.jsonl'), [tampered]);
    await expect(appendReviewDecision(run, { sourceId: input.sourceId, sourceHash: result.sourceHash, suggestionHash: result.suggestionHash as string, decision: 'accept', reviewer: 'qa', note: 'tampered' })).rejects.toThrow('hash mismatch');
    await expect(exportReviewedProposals(run, join(run, 'reviewed.jsonl'))).rejects.toThrow('hash mismatch');
  });

  it('serializes concurrent conflicting reviewers through the exclusive lock', async () => {
    const { run, result } = await setupRun();
    const base = { sourceId: 'review-1', sourceHash: result.sourceHash, suggestionHash: result.suggestionHash as string, reviewer: 'qa', decision: 'accept' as const };
    const outcomes = await Promise.allSettled([
      appendReviewDecision(run, { ...base, note: 'a', decidedAt: '2026-09-26T00:00:00.000Z' }),
      appendReviewDecision(run, { ...base, note: 'b', decidedAt: '2026-09-26T00:00:01.000Z' }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect((await readJsonLines(join(run, 'decisions.jsonl')))).toHaveLength(1);
  });

  it('renders escaped source text in reports', async () => {
    const { input, result } = await setupRun();
    const report = renderReport([result], [], [{ ...input, food: { ...input.food, food_description: '<script>alert("xss")</script>' } }]);
    expect(report).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(report).not.toContain('<script>alert("xss")</script>');
  });
});
