# Uniwind has no `group` / `group-hover:` — use RN-web pointer events

**Symptom (2026-07-17):** a web-only overlay button styled
`opacity-0 group-hover:opacity-100` (with `group` on the card wrapper)
rendered **always visible** — the unrecognized classes were dropped rather
than applied, so neither the hide nor the reveal happened.

**Cause:** uniwind does not implement Tailwind's parent-state variants
(`group`, `group-hover:`, `peer-*`). Plain self-variants like `hover:` work
on web, but there is no way to style an element from an ancestor's hover
state in CSS.

**Fix:** hover state in JS. React Native's `ViewProps` types include
`onPointerEnter`/`onPointerLeave` and react-native-web (0.21) forwards them
to DOM pointer events, so a `useState` hover flag on the wrapper `View`
conditionally renders the overlay (`src/components/media-card.tsx`). Fine
under the React Compiler; native never renders the overlay (`EXPO_OS`
gate), and pointer events barely fire there anyway.

**Related:** `docs/solutions/uniwind-classname-third-party-components.md`
(the other silent-className-drop trap).
