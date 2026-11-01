# AniList manga keep their total in `chapters`, never `episodes`

**Found:** 2026-11-01, wiring manga chapter logs (plan 0117 M1, issue #392).

## The trap

`logToAniList` decides `CURRENT` versus `COMPLETED` by comparing the logged
progress with the entry's total, read fresh through `getEntryState`. That read
selected only `Media.episodes`. AniList returns `episodes: null` for every
`type: MANGA` media, even a finished one; a manga's count is `Media.chapters`,
and volumes are a separate `Media.volumes`. So a manga never had a total, and
logging its last chapter left the entry `CURRENT` forever.

Nothing failed loudly. The `null` reads exactly like a still-releasing
series, which is a legitimate state.

## The fix

`getEntryState` selects `type episodes chapters`, and `normalizeEntryState`
takes `chapters` for manga and `episodes` otherwise, as
`AniListEntryState.total`. The relations read already selected all three
through `CARD_FIELDS`. `normalizeAniListMedia` made the same choice for
`totalEpisodes` long before.

## Rule

Any AniList read that needs "how many units does this entry have" must branch
on `type`. Progress counts chapters for manga, and AniList also accepts
progress past the known total (62 of 59), so compare with `>=`.
