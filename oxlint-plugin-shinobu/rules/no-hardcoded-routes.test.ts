import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('lint rejects inline app destinations but accepts centralized and external links', () => {
  const diagnostics = lint('no-hardcoded-routes', {
    'navigation.tsx': `
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
    `,
  });
  expect(diagnostics).toHaveLength(11);
});
