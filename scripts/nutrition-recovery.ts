import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { basename, resolve } from 'node:path';
import { createTypesafeClient, TypesafeClientError, TypesafeRequest } from '../src/catalog/recovery/typesafe-client';
import { createBudgetedRequest } from '../src/catalog/recovery/live-budget';
import { recoverDescription } from '../src/catalog/recovery/recover-description';
import {
  RECOVERY_MODEL,
  RECOVERY_POLICY_VERSION,
  RECOVERY_PROMPT_VERSION,
  RECOVERY_RESULT_SCHEMA,
  RecoveryInputV1,
  RecoveryResultV1,
  RecoverySource,
  TypesafeResponse,
} from '../src/catalog/recovery/recovery-types';
import { canonicalJson, sha256, validateRecoveryInput } from '../src/catalog/recovery/source-validation';
import {
  appendReviewDecision,
  createRunDirectory,
  exportReviewedProposals,
  readJsonLines,
  RecoveryManifest,
  renderReport,
  ReviewDecision,
  writeJsonLines,
  writeRunFile,
} from '../src/catalog/recovery/review-store';

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 1_000;

interface Args {
  _: string[];
  [key: string]: string | boolean | string[];
}

function parseArgs(argv: string[]): Args {
  const result: Args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (!arg.startsWith('--')) {
      result._.push(arg);
      continue;
    }
    const equal = arg.indexOf('=');
    if (equal >= 0) {
      result[arg.slice(2, equal)] = arg.slice(equal + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function requiredString(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`--${key} is required`);
  return value;
}

function numberOption(args: Args, key: string, required: boolean): number | undefined {
  const value = args[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error(`--${key} must be a non-negative integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`--${key} is too large`);
  return parsed;
}

function invalidResult(sourceId: string, sourceHash: string, runId: string, reason: RecoveryResultV1['reason']): RecoveryResultV1 {
  return {
    schemaVersion: RECOVERY_RESULT_SCHEMA,
    sourceId,
    sourceHash,
    runId,
    status: 'invalid_input',
    reason,
    method: 'none',
    spans: [],
    promptVersion: RECOVERY_PROMPT_VERSION,
    policyVersion: RECOVERY_POLICY_VERSION,
  };
}

async function readInput(path: string, runId: string): Promise<{ sources: RecoverySource[]; invalid: RecoveryResultV1[]; duplicates: number; conflicts: number; inputFileHash: string }> {
  const bytes = await readFile(path);
  if (bytes.byteLength > MAX_INPUT_BYTES) throw new Error(`input file exceeds ${MAX_INPUT_BYTES} bytes`);
  const sources: RecoverySource[] = [];
  const invalid: RecoveryResultV1[] = [];
  const byId = new Map<string, RecoverySource>();
  let duplicates = 0;
  let conflicts = 0;
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (lineNumber > MAX_ROWS) {
      invalid.push(invalidResult(`invalid-line-${lineNumber}`, sha256({ lineNumber, reason: 'too_many_rows' }), runId, 'invalid_schema'));
      continue;
    }
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      invalid.push(invalidResult(`invalid-line-${lineNumber}`, sha256({ lineNumber, reason: 'invalid_json' }), runId, 'invalid_schema'));
      continue;
    }
    const validation = validateRecoveryInput(value, lineNumber);
    if (!validation.ok) {
      invalid.push(invalidResult(validation.sourceId, validation.sourceHash, runId, validation.reason));
      continue;
    }
    const prior = byId.get(validation.source.sourceId);
    if (prior) {
      if (sha256(prior) === validation.sourceHash) {
        duplicates += 1;
        continue;
      }
      conflicts += 1;
      invalid.push(invalidResult(validation.source.sourceId, validation.sourceHash, runId, 'duplicate_conflict'));
      continue;
    }
    byId.set(validation.source.sourceId, validation.source);
    sources.push(validation.source);
  }
  return { sources, invalid, duplicates, conflicts, inputFileHash: sha256(bytes.toString('utf8')) };
}

interface ReplayEntry {
  id?: string;
  sourceId?: string;
  response?: TypesafeResponse;
  error?: string;
}

async function loadReplay(path: string): Promise<Map<string, ReplayEntry>> {
  const entries = await readJsonLines<ReplayEntry>(path);
  const replay = new Map<string, ReplayEntry>();
  for (const entry of entries) {
    const id = entry.sourceId ?? entry.id;
    if (id) replay.set(id, entry);
  }
  return replay;
}

function replayClient(entry: ReplayEntry): { choose: () => Promise<{ response: TypesafeResponse; latencyMs: number }> } {
  return {
    async choose() {
      if (!entry.response) throw new TypesafeClientError('provider_unavailable', entry.error ?? 'replay response unavailable');
      return { response: entry.response, latencyMs: 0 };
    },
  };
}

function usageSummary(results: RecoveryResultV1[]): Record<string, number> {
  return results.reduce<Record<string, number>>((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    counts[`method:${result.method}`] = (counts[`method:${result.method}`] ?? 0) + 1;
    return counts;
  }, {});
}

async function evaluate(args: Args): Promise<void> {
  const inputPath = resolve(requiredString(args, 'input'));
  const outputPath = resolve(requiredString(args, 'output'));
  const modeValue = args['mode'];
  const mode = modeValue === undefined ? 'replay' : String(modeValue);
  if (mode !== 'deterministic' && mode !== 'replay' && mode !== 'live') throw new Error('--mode must be deterministic, replay, or live');
  const runId = basename(outputPath);
  await createRunDirectory(outputPath);
  const input = await readInput(inputPath, runId);
  const responsesPath = typeof args['responses'] === 'string' ? resolve(args['responses']) : undefined;
  if (mode === 'replay' && !responsesPath) throw new Error('--responses is required in replay mode');

  const replay = responsesPath ? await loadReplay(responsesPath) : new Map<string, ReplayEntry>();
  let providerCalls = 0;
  const requestBudget = numberOption(args, 'max-requests', mode === 'live');
  const inputTokenBudget = numberOption(args, 'max-input-tokens', mode === 'live');
  if (mode === 'live' && args['allow-provider-calls'] !== true) throw new Error('live mode requires --allow-provider-calls');
  let liveClient: ReturnType<typeof createTypesafeClient> | undefined;
  let liveBudget: ReturnType<typeof createBudgetedRequest> | undefined;
  if (mode === 'live') {
    const apiKey = process.env['TYPESAFE_API_KEY'];
    if (!apiKey) throw new Error('TYPESAFE_API_KEY is required for live mode');
    liveBudget = createBudgetedRequest({
      request: globalThis.fetch.bind(globalThis) as unknown as TypesafeRequest,
      maxRequests: requestBudget as number,
      maxInputTokens: inputTokenBudget as number,
    });
    liveClient = createTypesafeClient({ apiKey, request: liveBudget.request, timeoutMs: 3_000 });
  }
  const results: RecoveryResultV1[] = [...input.invalid];
  const validSources: RecoveryInputV1[] = input.sources;
  let providerStopReason: 'unauthorized' | 'budget_exhausted' | undefined;
  for (const source of validSources) {
    let client: ReturnType<typeof createTypesafeClient> | { choose: (payload: never) => Promise<{ response: TypesafeResponse; latencyMs: number }> } | undefined;
    if (mode === 'replay') {
      const entry = replay.get(source.sourceId);
      client = entry ? replayClient(entry) : replayClient({ error: 'matching replay entry unavailable' });
    } else if (mode === 'live') {
      client = liveClient;
    }
    const result = await recoverDescription(source, {
      runId,
      client: providerStopReason ? undefined : client,
      providerFailureReason: providerStopReason,
      minConfidence: 0.9,
    });
    results.push(result);
    if (mode === 'live' && (result.reason === 'unauthorized' || result.reason === 'budget_exhausted')) providerStopReason = result.reason;
  }
  providerCalls = liveBudget?.state().providerCalls ?? 0;
  const manifest: RecoveryManifest = {
    schemaVersion: 'nutrition-recovery-run.v1',
    runId,
    createdAt: new Date().toISOString(),
    mode,
    model: RECOVERY_MODEL,
    promptVersion: RECOVERY_PROMPT_VERSION,
    policyVersion: RECOVERY_POLICY_VERSION,
    inputFileHash: input.inputFileHash,
    rowCount: results.length,
    providerCalls,
  };
  await writeRunFile(outputPath, 'manifest.json', `${canonicalJson(manifest)}\n`);
  await writeJsonLines(`${outputPath}/inputs.jsonl`, validSources);
  await writeJsonLines(`${outputPath}/results.jsonl`, results);
  await writeJsonLines(`${outputPath}/decisions.jsonl`, []);
  await writeRunFile(outputPath, 'summary.json', `${canonicalJson({ ...usageSummary(results), duplicates: input.duplicates, duplicateConflicts: input.conflicts, providerCalls })}\n`);
  await writeRunFile(outputPath, 'report.html', renderReport(results, [], validSources));
  if (mode === 'live') console.log(JSON.stringify({ runId, ...liveBudget?.state(), providerStopReason }));
  else console.log(JSON.stringify({ runId, mode, summary: usageSummary(results), providerCalls: 0 }));
}

async function report(args: Args): Promise<void> {
  const runDirectory = resolve(requiredString(args, 'run'));
  const [results, decisions, inputs] = await Promise.all([
    readJsonLines<RecoveryResultV1>(`${runDirectory}/results.jsonl`),
    readJsonLines<ReviewDecision>(`${runDirectory}/decisions.jsonl`).catch(() => []),
    readJsonLines<RecoveryInputV1>(`${runDirectory}/inputs.jsonl`).catch(() => []),
  ]);
  await writeRunFile(runDirectory, 'report.html', renderReport(results, decisions, inputs));
  console.log(`${runDirectory}/report.html`);
}

async function review(args: Args): Promise<void> {
  const runDirectory = resolve(requiredString(args, 'run'));
  const decision = requiredString(args, 'decision');
  if (decision !== 'accept' && decision !== 'reject') throw new Error('--decision must be accept or reject');
  const sourceId = requiredString(args, 'source-id');
  const currentResults = await readJsonLines<RecoveryResultV1>(`${runDirectory}/results.jsonl`);
  const currentResult = currentResults.find((entry) => entry.sourceId === sourceId);
  if (!currentResult) throw new Error(`no result for --source-id ${sourceId}`);
  const result = await appendReviewDecision(runDirectory, {
    sourceId,
    sourceHash: currentResult.sourceHash,
    suggestionHash: requiredString(args, 'suggestion-hash'),
    decision,
    reviewer: requiredString(args, 'reviewer'),
    note: typeof args['note'] === 'string' ? args['note'] : '',
    ...(typeof args['supersedes'] === 'string' ? { supersedes: args['supersedes'] } : {}),
  });
  const [results, decisions, inputs] = await Promise.all([
    readJsonLines<RecoveryResultV1>(`${runDirectory}/results.jsonl`),
    readJsonLines<ReviewDecision>(`${runDirectory}/decisions.jsonl`),
    readJsonLines<RecoveryInputV1>(`${runDirectory}/inputs.jsonl`),
  ]);
  await writeRunFile(runDirectory, 'report.html', renderReport(results, decisions, inputs));
  console.log(JSON.stringify(result));
}

async function exportReviewed(args: Args): Promise<void> {
  const runDirectory = resolve(requiredString(args, 'run'));
  const output = resolve(requiredString(args, 'output'));
  const proposals = await exportReviewedProposals(runDirectory, output);
  console.log(JSON.stringify({ output, count: proposals.length, schemaVersion: 'nutrition-recovery-reviewed-proposal.v1' }));
}

function printUsage(): void {
  console.log(`Usage:\n  nutrition-recovery evaluate --input FILE --output DIR [--mode deterministic|replay|live] [--responses FILE]\n  nutrition-recovery report --run DIR\n  nutrition-recovery review --run DIR --source-id ID --suggestion-hash HASH --decision accept|reject --reviewer LABEL --note TEXT [--supersedes ID]\n  nutrition-recovery export-reviewed --run DIR --output FILE\n\nLive mode additionally requires --allow-provider-calls --max-requests N --max-input-tokens N and TYPESAFE_API_KEY.`);
}


async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === 'help' || args['help'] === true) {
    printUsage();
    return;
  }
  if (command === 'evaluate') return evaluate({ ...args, _: args._.slice(1) });
  if (command === 'report') return report({ ...args, _: args._.slice(1) });
  if (command === 'review') return review({ ...args, _: args._.slice(1) });
  if (command === 'export-reviewed') return exportReviewed({ ...args, _: args._.slice(1) });
  throw new Error(`unknown command: ${command}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'nutrition recovery failed');
  process.exitCode = 1;
});
