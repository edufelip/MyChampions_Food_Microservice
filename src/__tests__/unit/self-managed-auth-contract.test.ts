import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('self-managed food API auth contract', () => {
  it('keeps Firebase out of active runtime source and configuration', () => {
    const activeFiles = [
      'package.json',
      '.env.example',
      '.env.local.example',
      'src/config.ts',
      'src/server.ts',
      'src/middleware/auth-guard.ts',
      'src/auth/mychampions-auth.ts',
      'infra/scripts/catalog-shadow-validate.js',
    ];

    for (const file of activeFiles) {
      expect(read(file)).not.toMatch(/firebase/i);
    }

    expect(read('package.json')).not.toMatch(/firebase-admin/i);
    expect(read('src/auth/mychampions-auth.ts')).not.toMatch(/firebase-auth|firebase-admin/i);
  });

  it('uses the root MyChampions profile endpoint as the auth authority', () => {
    expect(read('src/auth/mychampions-auth.ts')).toContain("${baseUrl}/me");
    expect(read('src/middleware/auth-guard.ts')).toContain('verifyMyChampionsAccessToken');
    expect(read('src/config.ts')).toContain('MYCHAMPIONS_AUTH_SERVER_URL');
  });
});
