import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('lint rejects inline app destinations but accepts centralized and external links', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinobu-route-lint-'));
  const file = join(dir, 'navigation.tsx');
  try {
    writeFileSync(file, `
      import { router as appRouter, useRouter as getRouter } from 'expo-router';
      declare const pushRoute: (href: unknown) => void;
      declare const router: { replace: (href: unknown) => void };
      declare const useRouter: () => any;
      declare const usePushRoute: () => any;
      declare const routes: { home: string; details: (id: string) => string };
      declare const Link: any;
      declare const Redirect: any;
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
      export const aliases = () => {
        const navigation = useRouter();
        const push = usePushRoute();
        const destination = '/search';
        navigation.push(destination);
        navigation['replace']('/settings');
        push('/diary');
        appRouter.push('/search');
        const { push: pushScreen } = getRouter();
        pushScreen('/settings');
        return <Redirect href="settings" />;
      };
    `);
    const result = Bun.spawnSync(['bun', 'x', '--no-install', 'oxlint', '--config', resolve('.oxlintrc.json'), '--format', 'json', file]);
    const diagnostics = JSON.parse(result.stdout.toString()).diagnostics;
    const violations = diagnostics.filter((diagnostic: { code: string }) => diagnostic.code === 'shinobu(no-hardcoded-routes)');
    expect(result.exitCode).toBe(1);
    expect(violations).toHaveLength(11);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
