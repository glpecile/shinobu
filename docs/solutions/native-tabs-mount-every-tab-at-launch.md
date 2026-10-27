# NativeTabs mounts every tab at launch

## Symptom

Cold start sat on the splash for about 3 s after Home had rendered (dev
build, iPhone 17 Pro simulator). One unbroken JS-thread stall ran from the
first render to the splash handoff.

## Cause

Expo Router's `NativeTabs` calls `usePreloadPlaceholderRoutes` with
`lazyByDefault: false`, in an effect right after the launch tab mounts. Diary,
Settings and Search then render in a single blocking commit (about 420 ms of
render, followed by a ~410 ms commit of their own updates), and with inline
requires, their module graphs (zod, `@expo/ui`, react-hook-form) evaluate
there too. `NativeTabs.Trigger` exposes no `lazy` option: its props are
copied into the options through an allowlist.

The `effect` barrel added about 280 ms more. `effect/dist/index.js`
re-exports every module, so one `import { Effect } from 'effect'` evaluates
all of them, including Arbitrary, the testing utilities and the platform
modules. Subpath imports (`import * as Effect from 'effect/Effect'`) give the
same namespaces, and `.oxlintrc.json` now rejects the bare barrel import.

## Fix

- Every tab screen except Home renders inside `components/deferred-tab`. A
  tab renders when it's focused, or once the boot splash has faded, through
  `useBootRevealed()`. That hook wraps `useDeferredValue`, so the reveal
  renders the hidden tabs as a background render that yields to touches.
- Home's closed `CardActionsSheet` waits for the reveal the same way. Its
  imports are most of the logging graph.
- The splash reveal starts in the commit that mounts the app
  (`docs/solutions/native-splash-logo-handoff.md`).

In dev, the handoff moved from ~4.0 s to ~1.2 s after the entry module started.

## Measuring boot

Dev builds route every module evaluation through
`global.__SYSTRACE.beginEvent/endEvent` (metro-runtime `require.js`). React
Native's `Systrace.js` overwrites that global during init, so a probe has to
pin it with `Object.defineProperty` and a no-op setter. A temporary entry file
(`package.json` `main`), run on a second Metro (`npx expo start --port 8082`),
can record the following without touching the user's server:

- per-module inclusive and self time;
- `React.Profiler` `onRender` rows around the root, the Stack and each Home
  section;
- a `setTimeout(0)` probe that logs stalls longer than 50 ms.

Read the results back with argent's `debugger-evaluate`. Release builds have
no Systrace hook, and their timings run several times faster, so compare dev
runs against each other only.
