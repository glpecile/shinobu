---
status: done
date: 2026-07-03
---

# 0002 — Switch to Bun + Prioritize Nitro Modules

## Context

Follow-up to `0001-project-scaffolding.md`. Decided to standardize on Bun as the
package manager/runner, and to prefer Nitro Modules-based libraries over bridge-based
ones wherever a Nitro alternative exists and covers the need.

## Decisions

- **Package manager: bun** (was pnpm). `pnpm-lock.yaml` removed, `bun.lock` is now the
  lockfile of record. `expo install` correctly auto-detects bun via the lockfile.
- **Storage: `react-native-mmkv`** (was `@react-native-async-storage/async-storage`).
  MMKV v4 is a Nitro Module, ~30x faster than AsyncStorage, and supports web via a
  `localStorage` fallback — stays universal without a platform-split wrapper. Requires
  peer dep `react-native-nitro-modules`.
- **Native networking: `react-native-nitro-fetch`** (Margelo, built on Cronet/
  URLSession). **iOS/Android only — no web build.** Web keeps using plain `fetch`. The
  convention: `lib/http/client.ts` (native, nitro-fetch) + `lib/http/client.web.ts`
  (web, plain `fetch`), same interface, so `state/queries/*` stays platform-agnostic.
- Pinned `react-native-nitro-modules@0.35.2` — the version `react-native-nitro-fetch`
  declares as its peer range (`^0.35.2`); `react-native-mmkv` accepts any version, so
  this satisfies both.
- Added `expo.doctor.reactNativeDirectoryCheck.exclude: ["react-native-nitro-fetch"]`
  to `package.json` — `expo-doctor` flags it as "untested on New Architecture" per
  React Native Directory metadata, which is a stale/false positive (Nitro modules are
  New Architecture by construction).

## Consequence

Because Nitro modules ship native code, the app can no longer run inside plain Expo
Go — it needs a custom dev client (`expo prebuild` + `expo run:ios`/`expo run:android`,
or an EAS dev-client build). This is a one-way door for this project going forward.

## Verification

`bun install`, `expo-doctor` (20/20), `tsc --noEmit`, and a Metro web-bundle boot all
passed clean after the swap.
