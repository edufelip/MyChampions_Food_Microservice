import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function runCli(args: string[]) {
  const result = spawnSync(process.execPath, ['-r', 'ts-node/register', resolve(process.cwd(), 'scripts/nutrition-recovery.ts'), ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, TYPESAFE_API_KEY: '' },
  });
  if (result.status !== 0) throw new Error(`CLI failed (${result.status}): ${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

describe('nutrition recovery CLI', () => {
  it('evaluates, reports, reviews, and exports a replay proposal without provider calls', () => {
    const root = mkdtempSync(join(tmpdir(), 'nutrition-recovery-cli-'));
    try {
      const input = resolve(process.cwd(), 'testdata/nutrition-recovery/development.jsonl');
      const responses = resolve(process.cwd(), 'testdata/nutrition-recovery/responses.jsonl');
      const deterministicRun = join(root, 'deterministic');
      const deterministicOutput = JSON.parse(runCli(['evaluate', '--input', input, '--output', deterministicRun, '--mode', 'deterministic'])) as { providerCalls: number };
      expect(deterministicOutput.providerCalls).toBe(0);
      expect(JSON.parse(readFileSync(join(deterministicRun, 'summary.json'), 'utf8'))).toMatchObject({ suggested: 5, providerCalls: 0 });
      expect(readFileSync(join(deterministicRun, 'report.html'), 'utf8')).toContain('Review only; not imported.');

      const replayRun = join(root, 'replay');
      const replayOutput = JSON.parse(runCli(['evaluate', '--input', input, '--output', replayRun, '--mode', 'replay', '--responses', responses])) as { providerCalls: number };
      expect(replayOutput.providerCalls).toBe(0);
      const results = JSON.parse(`[${readFileSync(join(replayRun, 'results.jsonl'), 'utf8').trim().split('\n').join(',')}]`) as Array<{ sourceId: string; status: string; method: string; suggestionHash?: string; usage?: unknown }>;
      const replayed = results.find((result) => result.sourceId === 'nutrition-17');
      expect(replayed).toMatchObject({ status: 'suggested', method: 'typesafe', usage: { inputTokens: 100, outputTokens: 50 } });
      expect(replayed?.suggestionHash).toEqual(expect.any(String));

      expect(runCli(['report', '--run', replayRun])).toContain('report.html');
      runCli(['review', '--run', replayRun, '--source-id', 'nutrition-17', '--suggestion-hash', replayed?.suggestionHash as string, '--decision', 'accept', '--reviewer', 'cli-test', '--note', 'verified replay']);
      const exportPath = join(root, 'reviewed.jsonl');
      expect(runCli(['export-reviewed', '--run', replayRun, '--output', exportPath])).toContain('"count":1');
      expect(readFileSync(exportPath, 'utf8')).toContain('nutrition-recovery-reviewed-proposal.v1');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15000);
});
