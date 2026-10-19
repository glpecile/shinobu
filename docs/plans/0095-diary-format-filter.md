# Diary format filter

- Add the All / Movies / TV control to the Diary header once the list has
  entries. It reuses `FORMAT_OPTIONS` and `matchesFormat` from the credit
  timeline: anime films count as Movies, anime series as TV, and manga
  appears only under All until reading gets its own surface.
- The filter narrows the rows, the calendar shading, and the month stats, so
  the streaks and "logged in" count match the visible list.
- A filter with no matches over the full history says so instead of showing
  an empty list. While older pages remain, the empty state names the loaded
  history and offers Load more, since the list cannot scroll to fetch it.
  All uses a book icon and "No visible logs" when every loaded title is hidden.
- In the 640–1024px range, show the month stats one per line beside the
  calendar. On phones, keep each label below its icon and number.
- While a month's stats are still lower bounds ("23+"), a quiet Load more
  button under them fetches the next older page, with a spinner while it
  loads. Quiet buttons tint on web hover.

These changes hot reload and require no native rebuild.

## Animation opportunities

| Location | Today | Purpose | Frequency | Motion |
| --- | --- | --- | --- | --- |
| Shared Button loading state | Spinner fades over a disappearing label | State indication | Occasional | Content fades and moves up 3px; spinner fades in from scale 0.9 and 3px below, over 180ms with cubic-bezier(0.23, 1, 0.32, 1). Reduced motion keeps opacity only. The button keeps its width and blocks repeat presses. |
| Filtered Diary empty state | Plain text appears abruptly | Preventing a jarring change | Rare | Reuse SectionEnter's 180ms opacity and 6px rise with the shared ease-out. Reduced motion keeps opacity only. TV and film icons reuse the empty-state tile. |

Both fit the under-300ms budget and leave readable data stationary. The shared
button transition has the highest value because it explains the wait wherever
Load more or another asynchronous action appears.

Rejected candidates:

- Diary tab switching is frequent navigation; keep the platform behavior.
- Diary rows are information users read and scroll through; no per-row entrances.
- The empty-state icon needs no looping animation; repetition would distract.

## Verification

- Type checking, lint, classnames, router-push checks, and all 1,471 tests pass.
- On the iPhone 17 Pro simulator, Movies drops Oct 14 to "1 film", keeps the
  anime film Vampire Hunter D, and recounts the October stats.
- Android dark mode: the filtered TV empty state shows its TV icon; Movies
  displays the filtered calendar and film rows.
- iOS light mode: the Load more idle and busy states retain the same width,
  and the busy control is announced as in progress. This used a temporary
  render fixture because the signed-in history was complete; the fixture was
  removed afterward. No provider write or stored data change was used.
- Review fixes were checked with an iOS render fixture: an empty TV filter
  retains Load more and invokes its callback; All shows its book icon and
  "No visible logs". The fixture was removed without stored data changes.
- Web, reduced-motion behavior, and release-device animation timing were not
  visually verified.
