# One airing notified two or three times

**Symptom.** The tray showed the same episode repeatedly — "Seihantai na Kimi
to Boku · S1E11" twice plus "You and I Are Polar Opposites · S1E11" (its English
title) a third time, all for one airing.

**Cause.** `computeNotificationSchedule` joined its cross-provider dedupes on
TMDB id alone. Anime rarely supplies one on every leg: an AniList entry is keyed
by `anilist`/`mal`, a Simkl anime row by `mal`, a Trakt row by `tmdb`/`tvdb`.
With no shared key the candidates all survived, and each provider's own title
made them look like different shows.

Up Next had already hit this (plan 0034 U9.5, "Youjo Senki II" / "Saga of Tanya
the Evil") and fixed it with `identityKeys` — namespaced keys over every id both
sides can carry. The scheduler was never moved onto it, so the cards collapsed
while the tray still doubled.

**Fix.** `identityKeys` is now exported from `features/up-next/compute.ts` and
is the join for all three scheduler dedupes. The pairwise order matters: Simkl
suppresses Trakt (`tmdb`/`tvdb`), then AniList suppresses what is left (`mal`) —
AniList and Trakt frequently share no id at all, so only the chain closes it.

Best-effort by design, unchanged: a candidate with no resolvable id leaves its
duplicate standing rather than guessing on title.
