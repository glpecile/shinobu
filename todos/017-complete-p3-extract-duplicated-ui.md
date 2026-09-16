---
status: complete
priority: P3
---

# Extract hand-rolled UI duplicated across screens

Follow-up to the `PickerSheet` extraction (#113). A read-only sweep on
2026-09-16 found these copies; line numbers are from that commit, so re-grep
before starting. Ranked by occurrences × drift. One PR per item.

1. **Details section head** → `<Section title count? subtitle?>`. 9 sites:
   `app/details/[id].tsx` (Studios), `person/people-section.tsx`,
   `provider-links/provider-links-section.tsx`, `person-links-section.tsx`,
   `show-seasons/seasons-section.tsx`, `anime-seasons/anime-seasons-section.tsx`,
   `release-timeline/release-timeline.tsx`, `credit-timeline/credit-timeline.tsx`
   (Filmography + its skeleton, which uses `items-center` vs `items-baseline`).
   Drift: `mb-1/2/4`, count/subline placement.
2. **Disclosure chevron** → `<DisclosureChevron open from="down"|"forward">`.
   7 sites. Rotating: `up-next/ui/section-header.tsx`, `log-media/tag-picker.tsx`,
   `components/rail-head.tsx`. Glyph swap: `components/media-carousel.tsx`,
   `write-sheet/provider-picker.tsx`, `components/collapsible.tsx`,
   `show-seasons/season-accordion.tsx`. Pick rotate.
3. **Eyebrow label** (`text-xs uppercase tracking-wider`) →
   `<Eyebrow tone="muted"|"accent">`; promote the local `SectionLabel` in
   `trackers/provider-cards-section.tsx`. 12 sites, including
   `components/picker-sheet.tsx`. Muted sites on `connect.tsx`, notifications
   settings and `connect-tmdb-token.tsx` also share label-over-`CARD_SHELL`.
4. **Text input** → `<TextField>`. 8 sites: `log-confirm-sheet.tsx` and every
   `connect-*-button` (Serializd twice); `connect-tmdb-token.tsx` drifts to
   `bg-background`.
5. **Sheet identity header** (artwork, title, muted line) →
   `<SheetHeader media eyebrow? title subtitle?>`. 5 sites:
   `card-actions-sheet.tsx`, `person-credit-sheet.tsx`,
   `episode-actions-sheet.tsx`, `trackers/provider-sheet.tsx`,
   `studio/studio-sheet.tsx`. Drift: title size, clamp, spacing, eyebrow side.
6. **Write-sheet body** (title, description, `WriteResultReport`, error,
   confirm/cancel) → `<WriteSheet>`. 4 sites: `log-confirm-sheet.tsx`,
   `watchlist-picker-sheet.tsx` (add + remove), `catch-up-log-sheet.tsx`
   (Retry/Done). Touches logging flows; test writes.
7. **External link pill** (ProviderIcon + label + `open-outline`) →
   `<LinkPill icon? label onPress>`. 3 identical copies in
   `provider-links-section.tsx`, `person-links-section.tsx`,
   `studio-links-section.tsx`, plus the studio pills in `app/details/[id].tsx`.
8. **Empty hint + round icon button.** Search's `CenteredHint` is
   `CenteredNotice` plus a kanji: add a `glyph` prop and delete it. The
   `w-10 h-10 rounded-full bg-surface/90 border` shell repeats in
   `floating-back-button.tsx`, `lightbox/index.web.tsx`,
   `app-shell/index.web.tsx` → `<RoundIconButton icon label onPress>`.
9. **Watchlist filter pill** idle state → `Button` (quiet, sm, pill,
   `filter-outline`, chevron) to match the filmography role button; the active
   inverted ✕ state stays. Move `ViewToggle` out of `features/watchlist` into
   `components/` (anime seasons imports it).
