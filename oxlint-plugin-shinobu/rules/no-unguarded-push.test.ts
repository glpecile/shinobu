import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('push guard follows router aliases and preserves non-press exemptions', () => {
  const diagnostics = lint('no-unguarded-push', {
    'screen.tsx': `
      import { router as appRouter, useRouter as getRouter } from 'expo-router';
      const navigation = getRouter();
      const { push: open, navigate: go } = navigation;
      appRouter.push(routes.home);
      navigation['navigate'](routes.home);
      getRouter().push(routes.home);
      open(routes.home);
      go(routes.home);
      // push-guard-exempt: a notification tap.
      // A repeat is another intent.
      navigation.push(routes.home);
      // push-guard-exempt: a keyboard shortcut.
      if (active) flushSync(() => appRouter.push(routes.search));
      // push-guard-exempt:
      navigation.push(routes.home);
      const pushRoute = usePushRoute();
      pushRoute(routes.home);
      navigation.replace(routes.home);
      array.push(item);
      // router.push(routes.home);
    `,
    'src/lib/navigation/index.ts': `router.push(href);`,
  });
  expect(diagnostics).toHaveLength(6);
});
