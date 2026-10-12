# Card sheet hides the log button for films it can't date

**Symptom (2026-10-12).** A Simkl library movie ("The Sun Never Sets",
released 2026-08-28) showed no log button at all in its card-actions sheet —
only the watchlist row — while Letterboxd sheets kept theirs.

## Cause

Two compounding facts. First, Simkl `/sync/all-items` rows carry year only
(`normalizeLibraryEntry` maps no `release_date`), so `filmReleaseStatus`
answers `'unknown'` for any current-year film and `watchlistCtaIsPrimary`
hid the button. Second, the card sheet's details enrichment (plan 0071) ran
only for Letterboxd-resolved rows, so unlike the details screen the sheet
never backfilled the date from TMDB — the one read that would have judged
the film `released`.

## Fix

`release-gate.ts` grew `needsReleaseEnrichment` (film-like rows the gate
reads as `unknown`); the card sheet reads those through the same
TMDB-backed `useMediaDetailsQuery` as details before deciding, so sheet and
details agree in every configuration. At the same time the hide-gate
narrowed to `unknown`-only: a genuinely unreleased film now keeps its
disabled log CTA ("Not yet released") beside the watchlist one — the anime
shape ("Episode 1 airs in 8 days") — instead of vanishing (owner override
2026-10-12).
