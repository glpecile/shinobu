# Expo Web SSR: MMKV storage accessed during server render

**Error:** `Tried to access storage on the server. Did you forget to call this in useEffect?`

**Context:** Expo Router web can run an SSR pass before hydration. `react-native-mmkv`
falls back to `localStorage` on web, but `localStorage` is not available in the
server/Node environment, so any module-level or render-time storage read throws.

## Fix

Keep storage reads out of module top-level and out of the initial render path
that executes on the server. For `useSyncExternalStore` hooks:

- Initialize the cached snapshot lazily inside the client `getSnapshot`, not at
  module import time.
- Provide a `getServerSnapshot` that returns a safe default (e.g. `[]`) without
  touching storage.
- Guard the client snapshot with `typeof window === 'undefined'` if there is any
  chance it could run during the SSR phase.

## Example

```ts
let cached: ProviderId[] | null = null;

function readSnapshot(): ProviderId[] {
  if (cached == null && typeof window !== 'undefined') {
    cached = connectedProviderIds();
  }
  return cached ?? [];
}

function getServerSnapshot(): ProviderId[] {
  return [];
}

export function useConnectedProviders(): readonly ProviderId[] {
  return useSyncExternalStore(subscribe, readSnapshot, getServerSnapshot);
}
```

## Consequences

- Server-rendered HTML matches the empty-state snapshot, then the client
  hydrates and re-renders with the real persisted state. A brief flash from the
  empty state to the connected state is the SSR-correct behavior.
- Never call `MMKV.get*`, `set*`, or `getAllKeys` at module top level if the
  module may be imported during web SSR.
