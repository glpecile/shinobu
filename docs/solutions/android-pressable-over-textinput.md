# Android: a pressable positioned *on top of* a `TextInput` never fires

**Found 2026-07-26** while fixing the search field's clear (X) button, which
worked on web and did nothing on Android.

## Symptom

The search field's clear button (`PresstableOpacity` inside an
`absolute right-1.5 top-0 bottom-0` overlay, sitting over the right edge of the
`TextInput`) rendered correctly and looked tappable, but tapping it on Android
did nothing at all: the text stayed, the results stayed, `?q=` stayed. Identical
code cleared instantly on web.

The tell is in the screenshot, not the logs: tapping the X made Android's **text
cursor drag-handle** pop up under the field. The touch was being delivered to the
`ReactEditText` underneath — the button on top never saw it, so `onPress` never
ran.

## What it was *not*

The plausible-looking hypothesis was a controlled-input echo: JS sets `value=''`,
Android's `EditText` delivers a queued `onChangeText` carrying the *old* text,
the debounce resurrects the query, and `keepPreviousData` re-renders the cached
results. That would have been fixed with an `inputRef.current?.clear()` plus a
just-cleared guard.

It was wrong, and one screenshot ruled it out: with an echo the field would
briefly go **empty** and then refill. Here the text never changed at all, and a
temporary `setInput('DIAGFIRED')` marker inside `clearSearch()` never appeared —
the handler was simply never called. Instrument the *handler*, not the state it
writes, before believing any story about state.

## Root cause

On Android, a focused `ReactEditText` claims the touch stream for its own bounds.
A sibling pressable that merely *overlaps* it — even one that is later in child
order, which is normally enough to win hit-testing — loses: pressto's pressables
are RNGH tap handlers, and RNGH does not activate a tap until the pointer is
released, by which time the `EditText` has already consumed the gesture. Web has
no such native text widget, so react-native-web's hit-testing gives the overlay
the click and the same code works there. Neither a longer press (`input swipe`
with a 120 ms hold) nor dismissing the keyboard first made any difference.

## Fix

**Stop overlapping.** Move the field's chrome (border, background, radius) onto a
`flex-row` wrapper and make the clear button a real sibling *beside* the input
rather than an absolute overlay on top of it (`src/app/(tabs)/search.tsx`):

```tsx
<View className="flex-1 flex-row items-center border border-border bg-surface rounded-md">
  <TextInput className="flex-1 text-foreground px-4 py-3 font-sans" … />
  {input !== '' && (
    <PresstableOpacity className="w-10 h-10 mr-1 …" onPress={clearSearch} … />
  )}
</View>
```

Visually near-identical (the input's reserved `pr-11` becomes real layout space
instead), and the button now occupies its own uncontested rectangle. The touch
target also grew from 32 to 40 dp on the way past.

## Lesson

Never put a pressable on top of a `TextInput` on Android — if a control belongs
"inside" a field, lay the field out as a row and let the control take its own
space. The pattern is silent: it looks right, it lints, and it works on every
web preview.

## Related

- `web-pressto-accessibility-role-kills-onpress.md` — the other silent
  pressto-never-fires trap, that one web-only.
- `web-mobile-search-autofocus-keyboard-flash.md` — the web half of the same
  search-bar pass.
