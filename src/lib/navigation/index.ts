import { useRouter } from 'expo-router';

import { createPushGuard } from './push-guard';

export { PUSH_GUARD_MS, createPushGuard, type PushGuard } from './push-guard';

/**
 * Module scope on purpose — the stack it guards is module scope too. A hook's
 * ref would reset with the component that held it, which is one of the holes
 * `push-guard.ts` explains this exists to close.
 */
const pushGuard = createPushGuard();

/**
 * `router.push`, minus the duplicate. Use this instead of `useRouter().push`
 * for anything a press can reach; `useRouter` stays the way to `back()`,
 * `replace()` or read navigation state.
 */
export function usePushRoute(): (href: string) => void {
  const router = useRouter();
  return (href: string) => {
    if (!pushGuard.allow(href)) return;
    // Cast: `routes.*` produces the literal template strings Expo Router's
    // `Href` union is built from, but they widen to `string` crossing this
    // boundary. Keeping the parameter `string` is what lets every call site
    // pass a `routes.*` result without restating its literal type.
    router.push(href as Parameters<typeof router.push>[0]);
  };
}
