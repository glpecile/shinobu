# A pressable's `accessibilityState` never reaches the DOM on web

**Symptom (2026-07-26).** Building `components/button`, the loading state looked
right — dimmed fill, spinner, "Connecting…" — but the rendered `<button>` on web
carried no `aria-busy`, no `aria-disabled` and no `disabled` attribute:

```html
<button role="button" class="… bg-accent/40" type="button" style="opacity: 1; …"></button>
```

…even though the component passed both `disabled={unavailable}` and
`accessibilityState={{ busy: loading, disabled: unavailable }}`.

**Cause.** On web, `components/presstable/index.web.tsx` renders
react-native-web 0.21's `Pressable`, not pressto
(`web-pressables-skip-gesture-handler.md`). `Pressable` maps `disabled` to
`aria-disabled` and blocks the press. react-native-web's `createDOMProps` reads
the flat `aria-*` and `accessibility*` props, never the `accessibilityState`
object, so `busy`, `selected` and `expanded` from it are dropped. Assistive tech
hears an ordinary, idle button while a fan-out is in flight.

**Fix.** `WebPresstable` maps `accessibilityState` to `aria-busy`,
`aria-disabled`, `aria-expanded` and `aria-pressed` (from `selected`) for every
caller. It drops `checked`: the role is always `button`, which does not allow
`aria-checked`, so a toggle passes `selected`. A caller's own `aria-*` prop still wins. Callers
pass `accessibilityState` once and `disabled` as the actual gate:

```tsx
<PresstableOpacity
  accessibilityState={{ busy: loading, disabled: unavailable, selected: pressed }}
  disabled={unavailable}
/>
```

With `aria-disabled` present, RNW also emits a real `disabled` attribute, which
is the correct web semantic (it blocks keyboard activation too, not just pointer
presses).

**Trap worth remembering — don't measure press-blocking by counting requests.**
The first probe of this fired a request, stalled it in a Playwright route
handler, then aborted it, and counted three requests: "disabled doesn't work."
Wrong. The three requests were 12 seconds apart, exactly the abort interval —
they were the HTTP layer's own retries (`lib/http`), not extra presses. Any probe
that aborts a request measures the retry policy, not the button. Hold the request
open for longer than the probe instead, and count.
