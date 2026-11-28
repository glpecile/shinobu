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

**Fix.** Pass the ARIA props explicitly alongside the RN ones. Native ignores
them:

```tsx
<PresstableOpacity
  accessibilityState={{ busy: loading, disabled: unavailable }} // native
  aria-busy={loading} // web
  aria-disabled={unavailable}
  aria-pressed={pressed}
  disabled={unavailable} // the actual gate
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
