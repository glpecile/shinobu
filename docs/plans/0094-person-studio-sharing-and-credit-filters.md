# Person and studio sharing and credit filters

- Reuse the floating share action on person and studio pages, choosing the
  resolved provider identity and reserving space beside the scrolled title.
- Keep list sharing visible beside the header, outside the scrolling filters.
  Long headings must shrink or wrap without moving the share target offscreen.
- Include AniList anime films in Movies and other anime in TV through the shared
  credit filter. Manga remains visible in All. Preserve provider identities.
- Verify the filter regression in the existing timeline tests and exercise
  sharing on the running iOS simulator, including Ghost in the Shell 2:
  Innocence and long list/person/studio headings.

These changes hot reload and require no native rebuild.

## Verification

- The new timeline regression failed before the filter fix and passes after it.
  All 30 targeted timeline, AniList normalization, and person fallback tests pass.
  The full `bun run test` suite passes 1,467 tests across 148 files.
- Type checking, lint, classnames, navigation, and external URL checks pass.
  Lint reports existing function-scoping warnings in unrelated tests.
- On the iPhone 17 Pro simulator, Mamoru Oshii's AniList page shows Kick-Heart
  in Movies and The Fire Hunter Season 2 in TV.
- Native sharing opens for Ghost in the Shell 2: Innocence, the long-titled
  Letterboxd list "movies that sound like youtube titles", and person/studio
  pages with temporary long-name cache fixtures. The scrolled person heading
  truncates before the share target. Temporary fixtures were restored.
- Android and web were not visually verified in this change.
