# An omitted `className` crashes a `withUniwind` component on web

## Symptom

A wrapper component that forwards an optional `className` to a `withUniwind`
component crashes on web the moment a caller omits it:

```
styleq: tailwind typeof undefined is not "string" or "null".
```

The stack points at the JSX line, not at the prop. Hit twice (`section-enter`,
then `disclosure-chevron` on 2026-09-16) before it became a rule.

## Cause

uniwind's web `withUniwind` turns every `*ClassName` prop into
`{ $$css: true, tailwind: value }` without checking the value. styleq accepts a
string or `null`; `undefined`, which is what an omitted optional prop is, fails.
Core `View`/`Text` are fine: uniwind's own web components guard it. Still
unfixed in uniwind 1.12.0.

## Fix

`src/lib/with-uniwind.tsx` wraps uniwind's HOC and drops undefined `*ClassName`
props before they reach it. Importing `withUniwind` from `uniwind` is banned in
`.oxlintrc.json`, so the idiom (`className?: string`, forwarded as-is) is safe
everywhere, and no wrapper needs a `className = ''` default.
