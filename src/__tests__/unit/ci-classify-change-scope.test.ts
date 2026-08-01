import { classify, parseNameStatusZ } from '../../../scripts/ci/classify-change-scope';

describe('classify', () => {
  it('keeps src-only changes narrow', () => {
    const result = classify(['src/routes/food-search.ts', 'src/__tests__/unit/food-search.test.ts']);
    expect(result.fullScope).toBe(false);
  });

  it('keeps docs-only changes narrow', () => {
    const result = classify(['README.md', 'DEPLOYMENT.md', 'docs/architecture.md']);
    expect(result.fullScope).toBe(false);
  });

  it('forces full scope on lockfile changes', () => {
    const result = classify(['package-lock.json']);
    expect(result.fullScope).toBe(true);
    expect(result.fullScopeHits).toContain('package-lock.json');
  });

  it('forces full scope on jest/tsconfig/eslint config changes', () => {
    expect(classify(['jest.config.js']).fullScope).toBe(true);
    expect(classify(['tsconfig.json']).fullScope).toBe(true);
    expect(classify(['eslint.config.mjs']).fullScope).toBe(true);
  });

  it('forces full scope on workflow changes', () => {
    const result = classify(['.github/workflows/ci.yml']);
    expect(result.fullScope).toBe(true);
  });

  it('forces full scope on classifier changes', () => {
    const result = classify(['scripts/ci/classify-change-scope.ts']);
    expect(result.fullScope).toBe(true);
  });

  it('fails conservative on unrecognized paths', () => {
    const result = classify(['some-new-top-level-thing.ts']);
    expect(result.fullScope).toBe(true);
    expect(result.unknownHits).toContain('some-new-top-level-thing.ts');
  });

  it('keeps mixed source + docs changes narrow', () => {
    const result = classify(['src/routes/food-search.ts', 'README.md']);
    expect(result.fullScope).toBe(false);
  });

  it('returns narrow scope on an empty diff', () => {
    const result = classify([]);
    expect(result.fullScope).toBe(false);
    expect(result.fullScopeHits).toEqual([]);
    expect(result.unknownHits).toEqual([]);
  });

  // src/__tests__/unit/self-managed-auth-contract.test.ts reads these files
  // via fs.readFileSync at runtime rather than importing them, so they have
  // no edge in Jest's require/import graph back to that test. Under narrow
  // scope, `jest --changedSince` would never select that test for a change
  // to these files alone, letting a real regression (e.g. a firebase
  // reference reintroduced into .env.example) go green silently. They must
  // force full scope, not be ignored.
  it('forces full scope on files read by the auth-contract test via fs, not import', () => {
    expect(classify(['.env.example']).fullScope).toBe(true);
    expect(classify(['.env.local.example']).fullScope).toBe(true);
    expect(classify(['infra/scripts/catalog-shadow-validate.js']).fullScope).toBe(true);
  });

  it('keeps other infra changes narrow', () => {
    const result = classify(['infra/nginx/food-microservice.conf', 'infra/scripts/deploy.sh']);
    expect(result.fullScope).toBe(false);
  });
});

describe('parseNameStatusZ', () => {
  it('parses simple add/modify/delete entries', () => {
    const raw = ['M', 'src/a.ts', 'A', 'src/b.ts', 'D', 'src/c.ts'].join('\0') + '\0';
    expect(parseNameStatusZ(raw)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('parses rename entries keeping old and new paths', () => {
    const raw = ['R100', 'src/old.ts', 'src/new.ts'].join('\0') + '\0';
    expect(parseNameStatusZ(raw)).toEqual(['src/old.ts', 'src/new.ts']);
  });
});
