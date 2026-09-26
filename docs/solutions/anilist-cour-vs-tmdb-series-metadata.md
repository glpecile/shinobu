# AniList cour vs TMDB series metadata

AniList gives each anime cour its own entry and progress counter. TMDB gives the whole show one TV record. An AniList Season 3 detail page can therefore resolve to the same TMDB id as Season 1, even though the TMDB year, first-air date, synopsis and episode total describe the full show rather than Season 3. Filling a missing AniList total from TMDB made an upcoming 12-episode cour show `0 / 60`; overriding its year showed the series premiere year.

On an AniList series entry, `applyPrimaryMetadata` uses TMDB only for missing art and external identity (needed for credits and episode mapping). Cour metadata stays with AniList, including unknown fields: a missing cour total is not an invitation to use the series total. Films and TMDB/Trakt TV records still use the usual TMDB-first merge.

Progress has the same boundary. The details tile and watched label read the entry's AniList progress, while Simkl library lookup for an anime series requires the cour's own Simkl id. A shared TMDB id must not make an unstarted sequel inherit a watched sibling's progress.
