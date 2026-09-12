# "🎉 You've watched every aired episode" on a show four episodes into its run

## Symptom

(owner, 2026-09-12.) *Lanterns*, 4 of 8 episodes watched, every aired episode
logged: the details CTA read **Rewatch** under "🎉 You've watched every aired
episode" — the copy for a show that has *ended*. The anime path, same shape
(10 of 13 watched), correctly read "Episode 11 not yet aired".

## Cause

Both trackers answer "what's next" from aired episodes only, so two very
different states arrive as the same empty pointer:

- **Trakt** `progress/watched` returns `next_episode: null` once every aired
  episode is watched, and its `seasons[]`/`aired` count list aired episodes
  only. Its `aired_episodes` is also what fills `totalEpisodes` for a
  Trakt-sourced item, so counting can't separate the cases either.
- **Simkl**'s `watching` snapshot simply omits `next_to_watch`.

Plan 0035 R17 split the *zero-aired* case out of that pointer (an announced
show was being celebrated as finished). The other half — caught up, more
scheduled — stayed on the rewatch branch.

Neither provider can name the episode or the date, because neither carries
unaired episodes at all. The season layout (`state/queries/show-seasons`, Trakt
or TMDB) does.

## Fix

`log-media-button.tsx` asks for the layout **only** in the two states whose
copy depends on it (`rewatch` or `unaired`) and takes
`firstUnairedEpisode(seasons)`: the first non-special episode that hasn't
aired. Present → the show isn't finished, so the CTA is disabled and says
which episode is waiting and when ("S1E5 airs in 3 days",
`unairedEpisodeLabel`); absent → the rewatch wrap stands exactly as before. On
the details screen it costs no request — the seasons accordion below has
already filled that cache entry.

An episode with no air date counts as unaired here, which is the *opposite* of
the permissive rule on a named next episode (`firstAired == null → aired`, so a
catalogue gap never blocks a log). The two are consistent: a caller already
told there is nothing left to log has no log to protect.

## Rule

A provider's "nothing next" is never a statement about the future — it is a
statement about what has aired. Anything that wants to distinguish *finished*
from *caught up*, or to count down to the next episode, has to read a
catalogue that carries unaired episodes.
