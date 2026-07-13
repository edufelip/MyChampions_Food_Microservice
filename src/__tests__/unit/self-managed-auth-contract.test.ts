import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('self-managed food API auth contract', () => {
  it('keeps Firebase out of active source, package, config, and documentation', () => {
    const activeFiles = [
      'package.json',
      'package-lock.json',
      '.env.example',
      '.env.local.example',
      'README.md',
      'DEPLOYMENT.md',
      'src/config.ts',
      'src/server.ts',
      'src/middleware/auth-guard.ts',
      'src/auth/mychampions-auth.ts',
      'infra/scripts/catalog-shadow-validate.js',
      'docs/functional-requirements/FR-001-domain-role-and-care-plans.md',
      'docs/business-rules/BR-207-food-search.md',
      'docs/acceptance-criteria/AC-207-food-search.md',
      'docs/discovery/decisions-log-v1.md',
      'docs/discovery/pending-wiring-checklist-v1.md',
      'docs/test-cases/TC-207-food-search.md',
      'docs/screens/v2/SC-207-nutrition-plan-builder.md',
    ];

    for (const file of activeFiles) {
      expect(read(file)).not.toMatch(/firebase/i);
    }
  });

  it('uses the root MyChampions profile endpoint as the auth authority', () => {
    expect(read('src/auth/mychampions-auth.ts')).toContain("${baseUrl}/me");
    expect(read('src/middleware/auth-guard.ts')).toContain('verifyMyChampionsAccessToken');
    expect(read('src/config.ts')).toContain('MYCHAMPIONS_AUTH_SERVER_URL');
  });
});
