import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RECOVERY_POLICY_VERSION, RECOVERY_PROMPT_VERSION, RecoveryInputV1, RecoveryResultV1 } from './recovery-types';
import { canonicalJson, sha256 } from './source-validation';

export const REVIEWED_PROPOSAL_SCHEMA = 'nutrition-recovery-reviewed-proposal.v1' as const;

export interface RecoveryManifest {
  schemaVersion: 'nutrition-recovery-run.v1';
  runId: string;
  createdAt: string;
  mode: 'deterministic' | 'replay' | 'live';
  model: string;
  promptVersion: string;
  policyVersion: string;
  inputFileHash: string;
  rowCount: number;
  providerCalls: number;
}

export interface ReviewDecision {
  schemaVersion: 'nutrition-recovery-decision.v1';
  decisionId: string;
  sourceId: string;
  sourceHash: string;
  suggestionHash: string;
  decision: 'accept' | 'reject';
  reviewer: string;
  note: string;
  decidedAt: string;
  supersedes?: string;
}

export interface ReviewedProposal {
  schemaVersion: typeof REVIEWED_PROPOSAL_SCHEMA;
  sourceId: string;
  sourceHash: string;
  suggestionHash: string;
  locale: RecoveryInputV1['locale'];
  source: {
    foodId: string;
    foodName: string;
    description: string;
  };
  selectedSpans: RecoveryResultV1['selected'];
  normalized100g: RecoveryResultV1['normalized100g'];
  review: {
    decision: 'accept';
    reviewer: string;
    note: string;
    decidedAt: string;
    decisionId: string;
  };
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const tempPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(tempPath, content, { encoding: 'utf8', mode: 0o600 });
  await rename(tempPath, path);
}

export async function writeRunFile(runDirectory: string, filename: string, content: string): Promise<void> {
  await ensurePrivateDirectory(runDirectory);
  await atomicWrite(join(runDirectory, filename), content);
}

export async function createRunDirectory(runDirectory: string): Promise<void> {
  try {
    await mkdir(dirname(runDirectory), { recursive: true, mode: 0o700 });
    await mkdir(runDirectory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`run directory already exists: ${runDirectory}`);
    throw error;
  }
}

export async function readJsonLines<T>(path: string): Promise<T[]> {
  const content = await readFile(path, 'utf8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

export async function writeJsonLines(path: string, values: unknown[]): Promise<void> {
  await atomicWrite(path, values.map((value) => canonicalJson(value)).join('\n') + (values.length > 0 ? '\n' : ''));
}

export function renderReport(
  results: RecoveryResultV1[],
  decisions: ReviewDecision[] = [],
  inputs: RecoveryInputV1[] = [],
): string {
  const decisionBySuggestion = new Map(decisions.map((decision) => [decision.suggestionHash, decision]));
  const inputById = new Map(inputs.map((input) => [input.sourceId, input]));
  const escape = (value: unknown): string => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const rows = results.map((result) => {
    const decision = result.suggestionHash ? decisionBySuggestion.get(result.suggestionHash) : undefined;
    const input = inputById.get(result.sourceId);
    const selected = result.selected ? JSON.stringify(result.selected) : '';
    const normalized = result.normalized100g ? JSON.stringify(result.normalized100g) : '';
    return `<article class="result" data-status="${escape(result.status)}" data-method="${escape(result.method)}" data-review="${escape(decision?.decision ?? 'unreviewed')}">
      <h2>${escape(result.sourceId)} <span>${escape(result.status)}</span></h2>
      <p><strong>Reason:</strong> ${escape(result.reason)} · <strong>Method:</strong> ${escape(result.method)}${result.model ? ` · <strong>Model:</strong> ${escape(result.model)}` : ''}</p>
      <p><strong>Source hash:</strong> <code>${escape(result.sourceHash)}</code>${result.suggestionHash ? ` · <strong>Suggestion hash:</strong> <code>${escape(result.suggestionHash)}</code>` : ''}</p>
      ${input ? `<p><strong>Original description:</strong> ${escape(input.food.food_description)}</p>` : ''}
      ${selected ? `<p><strong>Selected span IDs:</strong> <code>${escape(selected)}</code></p>` : ''}
      ${normalized ? `<p><strong>Normalized per 100 g:</strong> <code>${escape(normalized)}</code></p>` : ''}
      <p class="warning">Review only; not imported.</p>
      ${decision ? `<p><strong>Review:</strong> ${escape(decision.decision)} by ${escape(decision.reviewer)} — ${escape(decision.note)}</p>` : '<p><strong>Review:</strong> unreviewed</p>'}
    </article>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nutrition recovery review</title><style>
    :root{font-family:system-ui,sans-serif;color:#172033;background:#f6f7fb}body{max-width:1100px;margin:0 auto;padding:2rem}header{background:#172033;color:white;padding:1.5rem;border-radius:12px}label{margin-right:1rem}select{padding:.4rem}.result{background:white;border:1px solid #d8dce8;border-radius:10px;margin:1rem 0;padding:1rem}.result h2{margin-top:0}.result h2 span{font-size:.75rem;background:#e8edf8;padding:.25rem .5rem;border-radius:999px}.warning{color:#9b4d00;font-weight:700}code{overflow-wrap:anywhere}
  </style></head><body><header><h1>Nutrition description recovery</h1><p>Review-only proposals. No catalog import is available from this report.</p><p><label>Status <select id="status"><option value="">all</option><option>suggested</option><option>abstained</option><option>rejected</option><option>service_failure</option><option>already_accepted</option></select></label><label>Review <select id="review"><option value="">all</option><option value="unreviewed">unreviewed</option><option value="accept">accepted</option><option value="reject">rejected</option></select></label></p></header><main id="results">${rows}</main><script>
    const apply=()=>{const status=document.querySelector('#status').value;const review=document.querySelector('#review').value;document.querySelectorAll('.result').forEach((row)=>{row.hidden=(status&&row.dataset.status!==status)||(review&&row.dataset.review!==review);});};document.querySelectorAll('select').forEach((select)=>select.addEventListener('change',apply));
  </script></body></html>`;
}

async function acquireLock(lockPath: string): Promise<() => Promise<void>> {
  try {
    const handle = await open(lockPath, 'wx', 0o600);
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('review decision lock exists; inspect and remove only after confirming it is stale');
    }
    throw error;
  }
  return async () => {
    const { unlink } = await import('node:fs/promises');
    await unlink(lockPath).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  };
}

function expectedSuggestionHash(result: RecoveryResultV1): string {
  return sha256({
    source: result.sourceHash,
    selected: result.selected,
    normalized100g: result.normalized100g,
    model: result.model ?? null,
    promptVersion: RECOVERY_PROMPT_VERSION,
    policyVersion: RECOVERY_POLICY_VERSION,
  });
}

function latestDecision(decisions: ReviewDecision[], sourceId: string, suggestionHash: string): ReviewDecision | undefined {
  return decisions.filter((decision) => decision.sourceId === sourceId && decision.suggestionHash === suggestionHash).at(-1);
}

async function readDecisions(path: string): Promise<ReviewDecision[]> {
  return readJsonLines<ReviewDecision>(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
}

function assertResultIntegrity(result: RecoveryResultV1, input: RecoveryInputV1): void {
  const actualSourceHash = sha256(input);
  if (actualSourceHash !== result.sourceHash) throw new Error(`source hash mismatch for ${result.sourceId}`);
  if (result.status !== 'suggested' || !result.suggestionHash || expectedSuggestionHash(result) !== result.suggestionHash) {
    throw new Error(`suggestion hash mismatch for ${result.sourceId}`);
  }
}

export async function appendReviewDecision(
  runDirectory: string,
  input: Omit<ReviewDecision, 'schemaVersion' | 'decisionId' | 'decidedAt'> & { decidedAt?: string },
): Promise<ReviewDecision> {
  if (!input.reviewer.trim()) throw new Error('reviewer is required');
  if (input.decision === 'reject' && !input.note.trim()) throw new Error('rejection note is required');
  const decisionsPath = join(runDirectory, 'decisions.jsonl');
  const release = await acquireLock(`${decisionsPath}.lock`);
  try {
    const [results, inputs, existing] = await Promise.all([
      readJsonLines<RecoveryResultV1>(join(runDirectory, 'results.jsonl')),
      readJsonLines<RecoveryInputV1>(join(runDirectory, 'inputs.jsonl')),
      readDecisions(decisionsPath),
    ]);
    const result = results.find((entry) => entry.sourceId === input.sourceId);
    const source = inputs.find((entry) => entry.sourceId === input.sourceId);
    if (!result || !source || result.suggestionHash !== input.suggestionHash || result.sourceHash !== input.sourceHash) {
      throw new Error('current suggested result and suggestion hash are required');
    }
    assertResultIntegrity(result, source);
    const identical = existing.find((decision) =>
      decision.sourceId === input.sourceId &&
      decision.suggestionHash === input.suggestionHash &&
      decision.decision === input.decision &&
      decision.reviewer === input.reviewer &&
      decision.note === input.note,
    );
    if (identical) return identical;
    const prior = latestDecision(existing, input.sourceId, input.suggestionHash);
    if (prior && input.supersedes !== prior.decisionId) throw new Error('changing a decision requires --supersedes DECISION_ID');
    if (!prior && input.supersedes) throw new Error('--supersedes must reference the current decision');
    const decidedAt = input.decidedAt ?? new Date().toISOString();
    const decision: ReviewDecision = {
      schemaVersion: 'nutrition-recovery-decision.v1',
      decisionId: sha256({ sourceId: input.sourceId, sourceHash: input.sourceHash, suggestionHash: input.suggestionHash, decision: input.decision, reviewer: input.reviewer, note: input.note, decidedAt }),
      sourceId: input.sourceId,
      sourceHash: input.sourceHash,
      suggestionHash: input.suggestionHash,
      decision: input.decision,
      reviewer: input.reviewer,
      note: input.note,
      decidedAt,
      ...(input.supersedes ? { supersedes: input.supersedes } : {}),
    };
    await writeJsonLines(decisionsPath, [...existing, decision]);
    return decision;
  } finally {
    await release();
  }
}

export async function exportReviewedProposals(runDirectory: string, outputPath: string): Promise<ReviewedProposal[]> {
  const [results, inputs, decisions] = await Promise.all([
    readJsonLines<RecoveryResultV1>(join(runDirectory, 'results.jsonl')),
    readJsonLines<RecoveryInputV1>(join(runDirectory, 'inputs.jsonl')),
    readDecisions(join(runDirectory, 'decisions.jsonl')),
  ]);
  const byId = new Map(inputs.map((input) => [input.sourceId, input]));
  const proposals = results.flatMap((result) => {
    const input = byId.get(result.sourceId);
    if (!input || !result.suggestionHash) return [];
    assertResultIntegrity(result, input);
    const decision = latestDecision(decisions, result.sourceId, result.suggestionHash);
    if (!decision || decision.decision !== 'accept' || result.sourceHash !== decision.sourceHash) return [];
    return [{
      schemaVersion: REVIEWED_PROPOSAL_SCHEMA,
      sourceId: result.sourceId,
      sourceHash: result.sourceHash,
      suggestionHash: result.suggestionHash,
      locale: input.locale,
      source: { foodId: input.food.food_id, foodName: input.food.food_name, description: input.food.food_description },
      selectedSpans: result.selected,
      normalized100g: result.normalized100g,
      review: { decision: 'accept' as const, reviewer: decision.reviewer, note: decision.note, decidedAt: decision.decidedAt, decisionId: decision.decisionId },
    }];
  });
  await ensurePrivateDirectory(dirname(outputPath));
  await writeJsonLines(outputPath, proposals);
  return proposals;
}
