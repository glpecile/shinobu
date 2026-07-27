---
title: Credit Sheet, Search Actions, Clear Button & Hero CTA - Plan
type: fix
date: 2026-07-27
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: owner-report
execution: code
---

# Credit Sheet, Search Actions, Clear Button & Hero CTA - Plan

## Goal Capsule

Five owner-reported defects across the details, search and home surfaces. Four
are UI; the fifth is a metadata-precedence bug that makes artwork visibly swap
under the viewer on every details-screen open.

- **Authority:** AGENTS.md overrides this plan where they conflict (theme
  tokens only, pressto-only pressables, `cn()` for every composed className,
  kebab-case filenames, React Compiler — no manual memo).
- **Landing strategy:** one branch, one PR (R1–R5). R4 shipped three candidate
  CTA treatments for the owner to compare in-app; the choice (pill) landed in
  the same PR and the other two were deleted.

---

## Product Contract

### Summary

1. A Cast/Crew card is 96px wide and clamps its role to two lines, so long
   character names and multi-job crew credits die in an ellipsis — and tapping
   the card navigates away instead of answering the question. **Long-press it
   for the full credit.**
2. A search result is a dead end: press to open details is the only action, so
   logging something you just looked up costs a page load. **Give result rows
   the same actions the feed and diary rows have.**
3. The search field's clear button renders as a heavy grey blob on mobile web
   (reported on Firefox Android).
4. The home zero-providers CTA wraps "Connect your trackers" onto three lines
   inside a squat crimson block on a phone.
5. Opening any details screen re-paints the poster and backdrop a beat after
   the screen appears, because TMDB's artwork overrides art the viewer has
   already seen on the card they tapped.

### Problem Frame

- **(1)** `PersonCard` (`src/app/details/[id].tsx`) has one interaction: press →
  `/person/[id]`. Its `subtitle` (character or job) is `numberOfLines={2}` in a
  `w-24` column. There is no surface anywhere that shows a credit in full.
- **(2)** `SearchResultRow` is a bare `PresstableOpacity` → `openDetails`. The
  card-actions dialog (`CardActionsSheet` + `useCardActions`) already exists and
  is wired into the feed, diary, watchlist, person and studio surfaces —
  search is the only media surface without it.
- **(3)** `Ionicons name="close-circle"` at `size={20}` in `--color-muted` is a
  single solid glyph: it paints a filled light-grey disc that is the heaviest
  element in the header, and the icon font's circle rasterises with a ragged
  edge on Firefox Android on top of that.
- **(4)** `EmptyStateTile` passes `px-8` to `Button` through `className`.
  `Button` puts `className` on the **pressable**, which wraps the drawn box, so
  the 32px never widens the button — it wraps it in invisible padding and takes
  that width from the label. Nested with `EmptyFeed`'s own `px-8` and the tile's
  `px-8`, the label had ~126px to lay out in at 390px wide.
- **(5)** `applyPrimaryMetadata` (plan 0014) makes TMDB win for *every* display
  field including `coverImage`/`backdropImage`. The details screen renders
  instantly from the resolved feed/search item and re-renders when
  `useMediaDetailsQuery` resolves, so the poster the viewer just tapped is
  replaced by a different-but-equally-correct TMDB one.

### Requirements

- **R1** — Long-pressing a Cast or Crew card opens a sheet showing the credit in
  full: name, whether it's a cast or crew credit, the *unclamped* role text,
  and — when TMDB can serve it — the person's meta line and biography, plus a
  row into their filmography and the person "View on" provider links. On web,
  where long-press isn't discoverable, a hover-revealed ⋯ opens the same sheet.
  Pressing the card still navigates, unchanged.
- **R2** — A search result row carries the card-actions dialog: quick log (the
  existing `LogMediaButton`, with its confirm sheet), view details, and provider
  links. Long-press everywhere; the hover ⋯ on web. The dialog offers **every
  connected** provider that can address the item, not just the source provider —
  a result's "source" is an accident of which search answered first. The hide
  row is **omitted**: a search result is not a feed entry and hiding one would
  silently suppress it across every surface.
- **R3** — The clear (×) affordance reads as field chrome on every browser: a
  layout-drawn chip (not an icon-font disc) around a thin stroke, inside a
  44pt touch target.
- **R4** — The home CTA fits on one line at phone width. Three treatments
  (full-width block, pill, quiet outline) ship side by side on the empty home
  screen for the owner to compare in situ; the winner stays and the other two
  are deleted before merge.
- **R5** — TMDB artwork becomes a **failover**: it lands only when the item
  carries none. Every other TMDB-first display field keeps plan 0014's
  precedence, and the artless cases plan 0014 was written for (Trakt watched
  rows, Letterboxd slugs) still get TMDB art.

### Scope Boundaries

- Not touched: which fields other than artwork TMDB wins (overview, genres,
  rating, runtime, year, release dates all stay TMDB-first).
- Not touched: the feed/diary card-actions contract from plan 0023 R1 — those
  surfaces still show one "View on {source}" row. `providerLinks="connected"`
  is opt-in, and search is its only caller.
- Not touched: studio pills. A studio has a name and nothing to expand.
- No reverse: person → all credits on this title. The sheet is about *one*
  credit.

### Assumptions

- **A1** — The credit sheet's bio is a supplement, not the payload. Without a
  TMDB token or a TMDB person id (AniList-sourced people) the sheet still
  answers the question it was opened for — the full role text — so no empty
  state is designed for that case beyond rendering less.
- **A2** — Reserving the web ⋯ slot on search rows (40px, matching the diary)
  costs some title width. Accepted for consistency with the diary rather than
  adding a second row idiom.

---

## Planning Contract

### Key Technical Decisions

- **KTD1 — One row shell, not two.** The diary's `DiaryRowShell` already
  encodes the whole web ⋯ problem: the ⋯ can't be a *child* of the row's
  pressable (nesting two gesture-handler buttons lets a ⋯ press bubble into the
  row press), so on web the row splits into sibling pressables with the ⋯
  between them, while native stays one pressable. Search needs exactly that, so
  the shell is promoted to `components/actionable-row.tsx` (`ActionableRow`) and
  both surfaces use it — rather than a second copy that drifts.
- **KTD2 — The credit sheet's person query is the route's query.** Same key
  (`tmdbQueryKeys.person`), same staleness, non-suspending
  (`useTmdbPersonQuery` beside `useSuspenseTmdbPersonQuery`, per the AGENTS.md
  suspense-sibling convention). Opening the sheet warms the person page and
  vice versa, and the sheet renders its header instantly from the credit it was
  handed instead of holding behind a boundary.
- **KTD3 — `personMetaLine` moves to `features/person/meta-line.ts`.** The
  route and the sheet must format a person identically; it was a private helper
  in the route file.
- **KTD4 — `shape` on `Button`, not a `rounded-full` className.** `Button`
  draws its box on an inner `View` (a border on a pressto pressable is never
  drawn on Android — `docs/solutions/pressto-border-not-drawn-on-android.md`),
  so a radius passed through `className` only reaches the outer element and the
  inner box stays `rounded-md`. Shape is a prop, applied to both.
- **KTD5 — Artwork precedence is inverted in `applyPrimaryMetadata`, not at the
  call site.** The details screen already picks between four artwork sources in
  its fallback chain; putting the rule in the merge keeps one place that decides
  what a `NormalizedMediaItem`'s art is.

### High-Level Technical Design

| Change | File |
| --- | --- |
| Shared row shell (press / long-press / hover ⋯) | `src/components/actionable-row.tsx` (new) |
| Diary rows adopt it | `src/features/diary/diary-list.tsx` |
| Search rows adopt it + mount the actions sheet | `src/app/(tabs)/search.tsx` |
| Actions sheet: `providerLinks`, `canHide` | `src/features/card-actions/card-actions-sheet.tsx` |
| Credit sheet | `src/features/person/person-credit-sheet.tsx` (new) |
| Person meta-line helpers | `src/features/person/meta-line.ts` (new) |
| Non-suspending person query | `src/state/queries/tmdb.ts` |
| Cast/crew cards: long-press + hover ⋯ | `src/app/details/[id].tsx` |
| Clear button chip | `src/app/(tabs)/search.tsx` |
| `shape` prop + `className` contract | `src/components/button.tsx` |
| CTA padding + pill | `src/components/empty-state-tile.tsx`, `src/app/(tabs)/index.tsx` |
| Artwork fill-only | `src/lib/providers/merge-metadata.ts` |

---

## Verification Contract

- `bun lint`, `bun typecheck`, `bun test`, `bun check:classnames` all green.
- `merge-metadata.test.ts` covers both directions of R5: existing art survives a
  TMDB primary; an artless item takes TMDB's.
- Playwright (headless Chromium, dark, 390px and 1280px) exercised: search
  hover → ⋯ → actions sheet; details → cast hover → ⋯ → credit sheet with bio;
  the home CTA at phone width.
- README screenshots regenerated at 1600×1000 from the running web build.

## Definition of Done

R1–R5 implemented, one CTA treatment chosen and the others deleted, checks
green, README images refreshed.

## Follow-ups

- Native (iOS/Android) pass on the two new long-press gestures — verified on web
  only.
- `docs/releasing.md` still holds the F-Droid/IzzyOnDroid analysis the README no
  longer links to.
