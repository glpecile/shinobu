import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('lint requires immediate presses for disclosures and preserves guarded actions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinobu-disclosure-lint-'));
  try {
    writeFileSync(join(dir, 'disclosure.tsx'), `
      declare const PresstableOpacity: any;
      declare const PresstableScale: any;
      declare const PressableCard: any;
      declare const ActionableRow: any;
      declare const open: boolean;
      export const allowed = <>
        <PresstableOpacity accessibilityState={{ expanded: open }} pressBehavior="immediate" />
        <PressableCard accessibilityState={{ expanded: open }} pressBehavior={'immediate'} />
        <PresstableScale accessibilityState={{ selected: true }} />
        <PresstableOpacity pressBehavior="prevent-repeat" />
        <ActionableRow accessibility={{ accessibilityState: { expanded: open } }} pressBehavior="immediate" />
      </>;
      export const rejected = <>
        <PresstableOpacity accessibilityState={{ expanded: open }} />
        <PressableCard accessibilityState={{ expanded: false }} pressBehavior="prevent-repeat" />
        <PresstableScale aria-expanded={open} />
        <ActionableRow accessibility={{ accessibilityState: { expanded: false } }} />
      </>;
    `);
    const result = Bun.spawnSync(['bun', 'x', '--no-install', 'oxlint', '--config', resolve('.oxlintrc.json'), '--format', 'json', dir]);
    const diagnostics = JSON.parse(result.stdout.toString()).diagnostics;
    const violations = diagnostics.filter((diagnostic: { code: string }) => diagnostic.code === 'shinobu(immediate-disclosures)');
    expect(result.exitCode).toBe(1);
    expect(violations).toHaveLength(4);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

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

test('lint reserves red tokens and variants for logging entry points', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinobu-log-color-lint-'));
  const logging = join(dir, 'src/features/log-media');
  mkdirSync(logging, { recursive: true });
  try {
    writeFileSync(join(logging, 'confirm.tsx'), `
      declare const Button: any;
      export const allowed = <Button variant="log" className="bg-log text-log-foreground" />;
      export const raw = <Button style={{ backgroundColor: '#DC2625' }} />;
    `);
    writeFileSync(join(dir, 'general.tsx'), `
      declare const Button: any;
      declare const selected: boolean;
      export const neutral = <Button variant="primary" className="bg-foreground text-background" />;
      export const token = '--color-log';
      export const classes = <Button className="hover:bg-log/40" />;
      export const variant = <Button variant={selected ? 'log' : 'quiet'} />;
      export const template = <Button className={\`border-log \${selected ? 'px-2' : 'px-3'}\`} />;
      export const raw = <Button style={{ backgroundColor: 'rgb(220, 38, 38)' }} />;
      export const branding = <span style={{ color: '#DC2626' }}>忍</span>;
      export const tint = <Button className="bg-accent/10 text-accent-on-tonal" />;
      export const solid = <Button className="bg-accent" />;
    `);
    const result = Bun.spawnSync(['bun', 'x', '--no-install', 'oxlint', '--config', resolve('.oxlintrc.json'), '--format', 'json', dir]);
    const diagnostics = JSON.parse(result.stdout.toString()).diagnostics;
    const violations = diagnostics.filter((diagnostic: { code: string }) => diagnostic.code === 'shinobu(log-color-only)');
    expect(result.exitCode).toBe(1);
    expect(violations).toHaveLength(7);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
