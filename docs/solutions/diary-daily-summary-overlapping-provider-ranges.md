# Daily diary summaries and overlapping provider ranges

The day header counts films and distinct episodes across distinct shows, after
hidden items have been removed and before disclosure hides any rows.

Counting diary rows misses multi-episode AniList activity ranges. Summing their
lengths also overcounts when a Simkl log overlaps an AniList range. In live data,
five Simkl logs inside an AniList 40–51 range produced 17 episodes instead of 12.
Using only one preferred identity also counted Dragon Ball Z twice because one
provider supplied TMDB plus AniList IDs and another supplied only AniList IDs.

`formatDaySummary` joins shared identity aliases with a map and unions episode
numbers within each numbering namespace. An explicit season has its own
namespace. Without a season, an AniList/MAL entry has its own namespace so two
cours sharing a TMDB show can both include episode 1. It does not infer a mapping
between season-relative and absolute numbering. Manga identities stay separate
from show identities, and anime films count as films.

The formatted string is computed while flattening the day, outside row rendering.
The shared rail count shrinks and wraps, preserving the date and disclosure
control when a mixed summary grows.

Regression coverage lives in `src/features/diary/merge.test.ts`.
