# Widening the window past `md` blanks a list page until reload

## Symptom

(owner, 2026-09-16.) On web, narrowing `/person/71070` to the phone layout and
widening it back left the page empty beside the sidebar: back button only, no
header, no filmography, until a reload.

## Cause

Two things compound:

1. The sidebar was `w-full` below `md` and `md:w-60 md:transition-[width]`
   above it. The transition becomes active in the same style recalc that
   changes the width, so crossing `md` *animated* `100%` → `240px` over 220ms.
   The content column started at ~16px wide (sampled per frame) and grew back.
2. Legend List (3.3.11, `handleLayout`) sets `needsOtherAxisSize` when the list
   measures under 10px across, then pins the scroller to its measured cross
   size as an inline `width`. That pin is self-latching: the scroller now
   measures ~8px, so the flag never clears. A real window resize, which steps
   through frames, reliably lands one under 10px.

## Fix

The bar drops `w-full` and stretches (flex column default) instead. Its width
below `md` is `auto`, which can't interpolate, so the breakpoint snaps; the
collapse toggle's `240px` ↔ `64px` still animates.

## Rule

Never let a transition run across a breakpoint that changes a list's
container width: any frame under 10px wide latches Legend List's width.
