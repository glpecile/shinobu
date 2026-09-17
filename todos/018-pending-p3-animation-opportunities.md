---
status: pending
priority: P3
---

# Animation opportunities from the 2026-09-17 sweep

A read-only pass for moments that snap where the rest of the app already
animates. Each item is independent and small. Values come from `lib/motion.ts`;
don't add new curves or durations.

## 1. Morph "Mark as watched" to "Rewatch"

`features/show-seasons/season-accordion.tsx:148` and
`features/episode-details/episode-log-button.tsx:96` swap label and eye glyph
with a hard cut after a log. AGENTS.md already requires `morphLabel` on a label
that changes from user state. Pass it on both buttons. Seen a few times a day.

## 2. Crossfade the log sheet's provider toggles

`features/write-sheet/provider-picker.tsx:41-55` flips `bg-accent/10` and
`checkmark-circle`/`ellipse-outline` instantly, while the tag chips in the same
sheet crossfade. Copy `tag-picker.tsx:251`: a resting `bg-surface` layer under
an `AnimatedView` `bg-accent/10` layer whose `opacity` transitions over
`DURATION.color` with `EASE_OUT`. Stack the two icons the same way. 1–5 a day.

## 3. Let the last Continue Watching card exit

`features/up-next/up-next-section.tsx:176` unmounts the whole Continue Watching
block when its last card is logged, so the card's `CARD_EXIT` never plays
(Reanimated only runs `exiting` on the view actually removed). Put
`exiting={CARD_EXIT}` on the block's wrapper. Native only, like `CARD_EXIT`
(`docs/solutions/reanimated-web-exiting-pulls-child-out-of-flow.md`).

## 4. Diary skeleton stagger and swap

- `features/diary/diary-list.tsx:559` `SkeletonRow` takes `index` but passes no
  `delay`, so every row pulses in unison. Give each row's blocks
  `delay={staggerDelay(index)}` (AGENTS.md skeleton rule).
- Skeleton to list is a hard cut on native, where `lib/page-transition` is a
  no-op. Wrap the swap in a keyed `SectionEnter`, as `app/(tabs)/search.tsx`
  does.

## 5. Season accordion height on web

`season-accordion.tsx:191` opens through `DISCLOSURE_LAYOUT`, which
react-native-web ignores, so seasons snap open on web. Reuse the height
transition in `components/expandable-text/index.web.tsx` (`DURATION.toggle`,
`EASE_IN_OUT`).

## 6. Mark a provider connecting

Connecting a provider gives no toast or haptic, and the card jumps from
Accounts to Connected (`features/trackers/provider-cards-section.tsx:63-93`).
Fire `toast.success` naming the provider (it carries the success haptic) and
wrap the connected card in `SectionEnter`. Once per install, so this is the one
place a little delight is fine.

## Considered and rejected

- Web hover "⋯" buttons (`components/actionable-row.tsx:30`,
  `components/media-card.tsx:116`): hovered dozens of times a day, and a fade
  only delays reaching the button.
- Button width and slot motion on web (`components/button.tsx:41-50`): off on
  purpose (`docs/solutions/reanimated-web-layout-transition-scales-text.md`).
- Diary day and episode-run expanders: rows are virtualized, and entering
  animations replay on recycled cells
  (`docs/solutions/entering-animation-on-virtualized-cells-replays.md`).
- `components/load-more-footer.tsx` height jump: fix it with a constant
  height, not motion.
- Drag to dismiss on the web lightbox and sheet: mouse users don't expect it,
  and click, ✕ and Escape already close both.
