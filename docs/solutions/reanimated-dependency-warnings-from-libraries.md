# "Dependencies should only be used on the web" comes from libraries, not `src/`

**Symptom (2026-11-02).** Each Android bundle printed about eight
`[Reanimated] Dependencies should only be used on the web and are always
ignored on native.` warnings. `bun lint` was clean.

## Cause

Reanimated 4.7 (arrived with the SDK 58 upgrade, `cf10414`) warns once per call
site when `useAnimatedStyle`, `useDerivedValue`, or `useHandler` gets a deps
array on native. 4.5.1 had no such warning. Our code passes none, and
`shinobu/reanimated-no-deps` keeps it that way. The call sites are in
dependencies, still present in their latest releases as of this date:

- `pressto` 0.7.0 / 0.8.1: `useDerivedValue` ×2 and `useAnimatedStyle` in
  `pressables/base.js`, behind every pressable.
- `sonner-native` 0.27.0: five calls across the toast animation hooks.
- `@legendapp/list/reanimated` 3.6.0 / 3.7.1: the sticky-position
  `useAnimatedStyle`, used when `List` gets `sharedValues` or
  `itemLayoutAnimation`.

Native ignores the arrays, so behaviour is unaffected.

## Decision

Left as is. Patching three libraries for a dev-only warning fails the AGENTS.md
patch bar, and `configureReanimatedLogger({ level: error })` would hide real
Reanimated warnings too. Revisit when a library drops its deps arrays. A new
occurrence after that is ours, and the lint rule should catch it.
