import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('lint rejects inline app destinations but accepts centralized and external links', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinobu-route-lint-'));
  const file = join(dir, 'navigation.tsx');
  try {
    writeFileSync(file, `
      declare const pushRoute: (href: unknown) => void;
      declare const router: { replace: (href: unknown) => void };
      declare const routes: { home: string; details: (id: string) => string };
      declare const Link: any;
      export const allowed = () => {
        pushRoute(routes.details('anilist-1'));
        router.replace(routes.home);
        return <Link href="https://example.com/list" />;
      };
      export const rejected = (id: string) => {
        pushRoute('/search');
        router.replace('/settings');
        pushRoute({ pathname: '/details/[id]', params: { id } });
        const href = '/diary';
        return <Link href={\`/details/\${id}\`} />;
      };
    `);
    const result = Bun.spawnSync(['bun', 'x', '--no-install', 'oxlint', '--config', resolve('.oxlintrc.json'), '--format', 'json', file]);
    const diagnostics = JSON.parse(result.stdout.toString()).diagnostics;
    const violations = diagnostics.filter((diagnostic: { code: string }) => diagnostic.code === 'shinobu(no-hardcoded-routes)');
    expect(result.exitCode).toBe(1);
    expect(violations).toHaveLength(5);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
