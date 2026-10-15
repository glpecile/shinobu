# Mobile web: the search tab press carries its own focus request

**Symptom (2026-10-13).** Tapping the search icon on mobile web (Firefox
Android, iPad Safari) landed on `/search` with the field unfocused — no
keyboard. Re-tapping the icon did nothing: the bottom bar treated it as a
no-op. Desktop and native were fine.

**Cause.** Two halves:

1. `search.tsx` sets `autoFocus={!hasCoarsePointer()}` (see
   `web-mobile-search-autofocus-keyboard-flash.md`), so a touch browser never
   focuses on mount — deliberately, because commit-time focus has no user
   gesture behind it and those browsers refuse the keyboard for it.
2. Nothing else asked for focus. The web app shell navigated on a search press
   and no-opped on a re-press; the focus signal (`features/search/focus-signal`)
   only had the native tab-press and desktop ⌘K emitters, and an emission with
   no mounted subscriber was dropped — which is exactly the navigating-press
   case, where the screen mounts after the emit.

**Fix.** The press carries the request, because the tap is the only user
gesture in the flow and touch browsers only raise the keyboard on the back of
one:

- `components/app-shell/index.web.tsx` — one `onNavItemPress` helper for the
  bottom bar and the sidebar: a search press navigates (unless already there)
  and always `emitSearchFocusRequest()`s.
- `features/search/focus-signal.ts` — an emission with no subscriber waits as
  pending and fires once on the next subscribe (StrictMode's remount doesn't
  replay it). Emissions with a mounted subscriber land live, as before.
- `app/(tabs)/search.tsx` — web focuses synchronously in the handler. A
  re-tap/⌘K is inside the gesture. The original navigating-press delivery still
  happened from a mount effect, outside that gesture. The 50 ms deferral stays
  native-only (the native tab transition swallows a sync focus).

## Follow-up: commit navigation inside the gesture

The owner's 2026-10-13 recording still shows Firefox Android flashing its
keyboard open and closed. Holding a request until `useEffect` runs does not
preserve the tap's call stack; the original fix could not promise in-gesture
focus on first navigation.

- The shell uses React DOM's `flushSync` for search navigation only, then emits
  focus from the original press handler. ⌘K uses the same ordering.
- Search subscribes in a layout effect, so the listener exists when the commit
  returns. Native keeps its existing deferred focus behavior.
- Web blurs an already-focused field before refocusing it in the same handler:
  a browser may retain DOM focus after the user closes the keyboard, making a
  plain `focus()` a no-op.

Local iPhone simulator Safari verification: the first Home → Search tap opens
the keyboard and leaves the field focused after navigation. Firefox Android
and physical-device keyboard behavior still need verification; a desktop DOM
focus check is not proof of their on-screen keyboard behavior.

## Follow-up: the touch's mouse-down steals focus back

The owner's 2026-10-14 Firefox Android recording still shows the keyboard
flashing open and closed after PRs #241 and #251. Synchronous navigation was
not enough: focus was delivered, then taken away by the same tap.

Reproduced on 2026-10-15 in Firefox with Playwright's `hasTouch: true`:

```text
pointerup → RNGH onPress → input focusin
touchend → compatibility mousedown → input focusout → Search button focusin
mouseup → click
```

Pressto uses RNGH's `BaseButton`, which calls `onPress` from `pointerup`.
The subsequent compatibility mouse-down defaults to focusing the underlying
HTML button. That blurs the input even though it was focused synchronously
inside the user gesture. Both first navigation and active-tab re-taps fail;
waiting until focus is initially observed would miss the regression.

The Search button on both web navigation surfaces now prevents the mouse-down
default. `PresstableOpacity` exposes the DOM handler already forwarded by
pressto but missing from its types. Other navigation buttons retain normal
mouse focus, keyboard activation remains available, and native focus timing
is unchanged. No delayed refocus or dependency patch is needed.

Validation: before the change, Firefox touch input ends the tap with the Search
button focused; afterward, it ends with the input focused. First navigation,
re-tap after blur, and Ctrl+K pass in Firefox, Chromium, and WebKit touch and
desktop contexts; desktop Enter/Space activation also passes. Checks observe
the settled focus after the full gesture, outside the press debounce window.
These are browser DOM-focus checks, not Android keyboard evidence. The Android
emulator's package/window services returned `Broken pipe`, preventing Firefox
installation and on-screen keyboard verification. Firefox Android keyboard
persistence still needs a functioning emulator or physical-device check.

## Related

- `web-mobile-search-autofocus-keyboard-flash.md` — why `autoFocus` stays off
  on coarse pointers.
- `android-native-tab-press-timing.md` — the native side's blur-then-focus.
