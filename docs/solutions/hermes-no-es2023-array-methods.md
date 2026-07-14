# Hermes doesn't implement ES2023 change-by-copy array methods

## Symptom

`Render Error: undefined is not a function` on iOS/Android (dev client red
box), pointing at an `Array.prototype.toSorted` call — while the same code ran
fine on web and in `bun test`.

## Cause

Hermes (the RN JS engine) has not shipped the ES2023 change-by-copy array
methods: `toSorted`, `toReversed`, `toSpliced`, `with`. Web (V8/JSC) and bun
both have them, so the crash only surfaces when the code path first runs on a
device — tests and web give false confidence.

## Fix

Use `.sort()` / `.reverse()` on a fresh copy instead (e.g. after `.filter()`,
or on `[...arr]`). oxlint's `unicorn/no-array-sort` rule actively suggests
`toSorted()`, so it is turned **off** in `.oxlintrc.json` — don't re-enable it
while Hermes lacks the method.

## Lesson

Anything newer than ~ES2022 needs a check against Hermes' supported features
before use; "it passes bun test and runs on web" proves nothing about Hermes.
