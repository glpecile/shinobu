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
  re-tap/⌘K is inside the gesture, so the keyboard opens; a navigating press
  is consumed on mount, still on the back of the tab's tap. The 50 ms deferral
  stays native-only (the native tab transition swallows a sync focus).

**Per-browser expectations.** Chrome Android should now raise the keyboard on
a search tap (transient activation covers the mount). Firefox Android's
commit-time flash was a no-activation focus; this one follows a real tap, but
re-verify on device — if the flash reproduces, the arrival focus needs a
rethink, not the re-tap path. iPad Safari cannot raise the keyboard from a
post-navigation focus (WebKit requires the `focus()` call inside the gesture
handler, and the input mounts after it); first tap focuses the field at most,
re-tap while open raises the keyboard. That is OS policy, not a bug in this
code — verify before "fixing" it.

## Related

- `web-mobile-search-autofocus-keyboard-flash.md` — why `autoFocus` stays off
  on coarse pointers.
- `android-native-tab-press-timing.md` — the native side's blur-then-focus.
