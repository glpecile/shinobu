# A pressto pressable's `disabled`/`accessibilityState` never reaches the DOM

**Symptom (2026-07-26).** Building `components/button`, the loading state looked
right — dimmed fill, spinner, "Connecting…" — but the rendered `<button>` on web
carried no `aria-busy`, no `aria-disabled` and no `disabled` attribute:

```html
<button role="button" class="… bg-accent/40" type="button" style="opacity: 1; …">
```

…even though the component passed both `disabled={unavailable}` and
`accessibilityState={{ busy: loading, disabled: unavailable }}`.

**What is and isn't broken.** The press *is* blocked. pressto forwards `disabled`
to RNGH's `BaseButton` as `enabled` (`pressto/lib/module/pressables/base.js`), and
its web implementation honours it — three forced taps on a button in its loading
state produced exactly one request. What's missing is only the *announcement*:
neither `disabled` nor `accessibilityState` is mapped onto the DOM node, so
assistive tech hears an ordinary, idle button while a fan-out is in flight.

**Fix.** Pass the ARIA props explicitly alongside the RN ones — they forward
through pressto to the DOM, and native ignores them:

```tsx
<PresstableOpacity
  accessibilityState={{ busy: loading, disabled: unavailable }}  // native
  aria-busy={loading}                                            // web
  aria-disabled={unavailable}
  disabled={unavailable}                                         // the actual gate
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
