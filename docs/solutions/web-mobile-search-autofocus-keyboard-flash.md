# Mobile web: `autoFocus` on the search field flashes the keyboard open, then closed

**Found 2026-07-26.** Firefox Android: opening `/search` raised the on-screen
keyboard for an instant and then dismissed it, leaving the field focused but
unusable for typing. Desktop web and native were fine.

## Root cause

`search.tsx` set `autoFocus` unconditionally. react-native-web forwards
`autoFocus` to the DOM, and React answers it with a programmatic `node.focus()`
at commit time. Mobile browsers deliberately refuse to raise the keyboard for a
focus with **no user activation behind it** — Firefox Android does so by opening
and immediately closing it.

## Fix

`src/lib/pointer.ts` — `hasCoarsePointer()`, a `matchMedia('(pointer: coarse)')`
probe that returns `false` when `matchMedia` is missing (native, and web SSR).
`search.tsx` sets `autoFocus={!hasCoarsePointer()}`, so native and fine-pointer
web keep auto-focus while touch browsers wait for the user's tap.

Losing programmatic auto-focus on touch web is the trade, not a regression:
those browsers would not have raised the keyboard for it anyway. The ⌘K path
(`features/search/focus-signal.ts`) is desktop-only and untouched.

## Rejected: forwarding `keyboardShouldPersistTaps` on web

The obvious second suspect was `components/List/index.web.tsx`, which strips
`keyboardShouldPersistTaps` with the comment *"keyboard is a native concern"*.
That looks wrong, because react-native-web's ScrollView **does** implement the
prop and uses its *absence* to blur the focused input on any touch the scroll
responder claims:

```js
// react-native-web/dist/exports/ScrollView/index.js
if (!this.props.keyboardShouldPersistTaps && currentlyFocusedTextInput != null &&
    e.target !== currentlyFocusedTextInput && …) { /* blur */ }
```

**It is not wrong, because that ScrollView is never rendered.** Metro resolves
`@legendapp/list/react-native` to the package's `react-native.web.js` on web,
which ships its own `ListComponentScrollView` over a raw `<div>`. Forwarding the
prop therefore reaches no consumer — it just spreads
`keyboardshouldpersisttaps` onto that div and logs *"React does not recognize
the `keyboardShouldPersistTaps` prop on a DOM element"* on every mount.

Confirmed both ways in a headless browser: with the prop forwarded, the attribute
appears on a class-less scrollable `div` (not an RNW `css-view-*` node) and the
warning fires; with it stripped, no warning — and tapping a result still
navigates on the first tap either way.

The strip stays. `index.web.tsx` carries this warning inline so the next reader
doesn't re-derive it from RNW's source and "fix" it back.

## Lesson

Before trusting a react-native-web behavior, check that the RNW component in
question is the one actually being rendered. A third-party list/scroll library
may ship a web build that replaces it wholesale, which silently invalidates
every conclusion drawn from RNW's source.

## Related

- `android-pressable-over-textinput.md` — the Android half of the same search-bar
  pass (the clear button that never fired).
- `legend-list-horizontal-content-padding-web.md` — another Legend List web-build
  divergence.
