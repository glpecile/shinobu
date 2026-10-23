import { router as imperativeRouter, useRouter } from 'expo-router';

import { openedInNewTab } from './new-tab';
import { createPushGuard } from './push-guard';

export { PUSH_GUARD_MS, createPushGuard, type PushGuard } from './push-guard';

/**
 * Module scope on purpose — the stack it guards is module scope too. A hook's
 * ref would reset with the component that held it, which is one of the holes
 * `push-guard.ts` explains this exists to close.
 */
const pushGuard = createPushGuard();

/**
 * The stack promotes any hidden screen of the pushed route's name and swaps in
 * the new params, so a press-in on one card followed by a tap on another
 * flashed the first card's page. Detail routes have no `getId` on purpose:
 * with one, every press-in during a scroll would keep its own hidden screen.
 */
let preloadedHref: string | null = null;

/**
 * Link navigation shares the imperative push guard, keyed by its public route.
 * An allowed push replaces a hidden screen preloaded for a different href.
 */
export function allowRoutePush(href: string): boolean {
  if (!pushGuard.allow(href)) return false;
  if (preloadedHref != null && href !== preloadedHref) {
    imperativeRouter.prefetch(href as Parameters<typeof imperativeRouter.prefetch>[0]);
    preloadedHref = href;
  }
  return true;
}

/**
 * Renders `href` hidden in the stack so the push that follows lands on a
 * mounted screen. Call it on press-in of a press that always navigates. The
 * stack keeps one preloaded screen per route, so a press-in that turns into a
 * scroll costs one hidden render. Native only: on web the hidden screen's
 * `<Head>` would retitle the tab.
 *
 * Urgent, not in a transition: a pending preload let the tap's push promote
 * an older hidden screen, then swapped in the new one, so Android slid the
 * page in twice (docs/solutions/stale-detail-preload.md).
 */
export function usePreloadRoute(): (href: string) => void {
  const router = useRouter();
  return (href: string) => {
    if (process.env.EXPO_OS === 'web') return;
    router.prefetch(href as Parameters<typeof router.prefetch>[0], { inTransition: false });
    preloadedHref = href;
  };
}

/**
 * `router.push`, minus the duplicate. Use this instead of `useRouter().push`
 * for anything a press can reach; `useRouter` stays the way to `back()`,
 * `replace()` or read navigation state. Returns whether the push was accepted
 * (false for a blocked duplicate or a web new-tab open), so contextual press
 * feedback stays quiet when nothing happened in this tab.
 */
export function usePushRoute(): (href: string) => boolean {
  const router = useRouter();
  return (href: string) => {
    // Web only; a no-op elsewhere.
    if (openedInNewTab(href)) return false;
    if (!allowRoutePush(href)) return false;
    // Cast: `routes.*` produces the literal template strings Expo Router's
    // `Href` union is built from, but they widen to `string` crossing this
    // boundary. Keeping the parameter `string` is what lets every call site
    // pass a `routes.*` result without restating its literal type.
    router.push(href as Parameters<typeof router.push>[0]);
    return true;
  };
}
