# List counts and alphabetical sorting

- Remove the watched numerator's `+`. Keep the lower-bound description for
  incomplete public Letterboxd history in the accessible label and browser
  tooltip. Keep the denominator's `+` only while another list page exists.
  Loading every list entry does not establish every personal watched flag.
- Remove runtime sorting from watchlists and custom lists. Letterboxd grid
  records lack durations, so the comparator often falls back to title order.
  Do not add detail requests to make a sort work. Retired saved runtime choices
  fall back to Recently added or List order.
- Offer alphabetical A to Z and Z to A, keeping release year and original order.
  Compare titles without case differences and with natural number ordering.
  Preserve tracker filtering, pagination and loaded-subset notices.
- Add a themed clock beside the card-actions runtime, fading the whole row
  together and leaving no clock when duration is unknown.

Otraku's `EntrySort` and AnymeX's `SortType` both include title, rating, progress
and added/release ordering. Title is reliable across our providers. Rating,
popularity, progress and activity dates need consistent coverage and units
before becoming shared sorts; leave them out of this change.

References:
- https://github.com/lotusprey/otraku/blob/main/lib/feature/media/media_models.dart
- https://github.com/RyanYuuki/AnymeX/blob/main/lib/screens/library/controller/library_controller.dart

Validate the sorter and existing cache-observer regression, run the full test
suite and repository checks, inspect native rendering and sort interactions,
then complete correctness, complexity and UI reviews before shipping.
All changes hot reload; no native rebuild is required.

## Validation results

- All 1,445 tests pass across 148 files. Typecheck, lint, classnames, guarded
  navigation, external links and whitespace checks pass. Lint retains five
  existing warnings in untouched tests.
- iPhone 17 Pro: the saved runtime preference falls back to List order; the
  native menu offers alphabetical and year choices with no runtime choices;
  A to Z and Z to A change the actual poster order. The complete 12-film list has no
  numerator or denominator `+`. This simulator's connected account differs
  from the owner's Letterboxd account, so its watched count is not a parity
  check against the supplied screenshot.
- Evil Dead Burn's actions sheet renders a themed clock beside `110 min`.
  Native accessibility exposes `At least 2 of 12 watched` and a single
  `110 min` runtime group without the icon glyph.
- Delegated correctness and UI reviews caught the missing accessible grouping
  and runtime text shrink constraint; both fixes were re-reviewed and approved.
  The delegated complexity review found nothing to remove.
- No browser surface is available to the UI tool for web interaction checks.
- Android smoke validation is unavailable: launching the installed app and
  opening its local Metro dev-client link returned to the launcher. This did
  not reach the changed UI; no cause or connection to this change is established.
