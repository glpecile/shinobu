# A Reanimated `entering` fade overwrites a static `opacity` on the same node

**Symptom (2026-09-11).** Metro logged, on native:

```
[Reanimated] Property "opacity" of AnimatedComponent(View) may be overwritten
by a layout animation. Please wrap your component with an animated view and
apply the layout animation on the wrapper.
```

Visually: a **disabled** `components/button` that carries an icon (the log
button while `!canLog`, the watchlist buttons once settled) drew its icon at
full strength beside a dimmed label and container.

## Cause

`animationBuilder.tsx` builds the entering/exiting/layout animation, compares
its animated properties against the node's own `style`, and warns on any
overlap — the layout animation wins, because it drives the property until it
ends and leaves it at its final value.

The button's icon slot was exactly that overlap: `entering={FadeIn}` (animates
`opacity` 0 → 1) on the same `AnimatedView` whose className carried
`unavailable && 'opacity-60'`. Uniwind compiles that class into the node's
`style`, so the enter fade finished by pinning the icon back to `opacity: 1`.

`LinearTransition` (`layout`) does **not** animate opacity, so the label
slot's `opacity-0` overlay class is unaffected — only the `FadeIn`/`FadeOut`
slots were.

## Fix

Split the node, as the warning says: the outer `AnimatedView` keeps
`entering`/`exiting`/`layout`, a nested `AnimatedView` carries the dim class
and the colour transition (`src/components/button.tsx`).

## Rule

Never put a static `opacity` (class or style) on the same node as `FadeIn`,
`FadeOut`, or a `Keyframe` that animates opacity. Dimming goes one level in.
