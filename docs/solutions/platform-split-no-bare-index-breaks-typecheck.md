# A platform-split pair with no bare `index.ts` fails `tsc`, even though Metro resolves it fine

## Symptom

`bun run typecheck` failed with `TS2459: Module './index.native' declares
'X' locally, but it is not exported` after adding a new platform-split
directory shaped as `scheduler/index.native.ts` + `scheduler/index.web.ts`
(no bare `index.ts`) and importing `@/features/notifications/scheduler`
elsewhere. Metro would have resolved this pair correctly at bundle time —
only `tsc` choked.

## Cause

AGENTS.md's "Platform-Specific Files" section shows the pattern as
`index.tsx` / `index.web.tsx` / `index.native.tsx`, which reads like any
subset is fine. In practice every existing platform-split pair in this repo
(`components/connect-serializd-button`, `components/provider-signin-webview`,
`components/letterboxd-write-bridge`) is **bare `index.tsx` (default/web) +
`index.native.tsx` (native override)** — never `index.web.ts` +
`index.native.ts` with no bare file.

That asymmetry isn't a style choice — it's forced by `tsconfig.json`. This
project's `moduleResolution` is `bundler` with no `moduleSuffixes`
configured, so `tsc` resolves `import ... from './scheduler'` to
`./scheduler/index.ts` literally. Metro applies its own platform-extension
resolution independently (`.native.ts` wins on iOS/Android, the bare file is
the fallback everywhere else including web) — the two resolvers agree only
when a bare `index.ts`/`index.tsx` exists.

## Fix

For a native-only-behavior split, always ship the bare file as the
default/web implementation and add `index.native.ts(x)` as the override —
never `index.web.ts` paired with `index.native.ts` and no bare file. If the
default implementation should itself be a no-op (e.g. a feature that's
native-only), make the bare `index.ts` the no-op:

```
scheduler/
  index.ts          # web/default — no-op or web behavior, resolves for tsc
  index.native.ts   # real native implementation, wins on iOS/Android
```

Applies to plan 0020 (release notifications) — `features/notifications/scheduler`,
`features/notifications/notifications-settings`,
`features/notifications/use-notification-tap-navigation`,
`features/notifications/notifications-runtime`, and
`features/notifications/background-task` all follow this shape (the latter two
were fixed after initially landing as bare, non-split files that pulled
`expo-notifications`/`expo-task-manager`/`expo-background-task` into the web
bundle — see `docs/solutions/expo-notifications-foreground-handler.md`).

## Addendum (2026-09-03): the bare file and the native file must share an extension

`notifications-runtime/` shipped as `index.ts` (no-op) + `index.native.tsx`
(real runtime) and Metro **served the no-op on Android and iOS** from
2026-07-24 until this fix. `metro-resolver` walks `sourceExts` in order and,
for *each* extension, tries `index.<platform>.<ext>`, `index.native.<ext>`,
then `index.<ext>` (`resolveSourceFileForAllExts` in `resolve.js`). With
`.ts` ahead of `.tsx`, `index.ts` matches before `index.native.tsx` is ever
considered. Nothing warns: the bundle loads, the component renders `null`.

Effect here: no foreground refresh, no background-task registration, no
foreground notification handler. The only refresh that ever ran was the one
`handleToggle` fires when the toggle is enabled, so the batch covered seven
days and then went silent — "notifications stopped lately".

Rule: `index.<ext>` and `index.native.<ext>` use the **same** extension. Check
with

```
for d in $(find src -name 'index.native.*' -exec dirname {} \; | sort -u); do ls "$d"; done
```

Verified on the runtime by listing Metro's module table (`__r.getModules()`
verbose names): before, `notifications-runtime/index.ts` was initialised;
after the rename to `index.tsx`, `index.native.tsx` is.
