# Serializd diary artwork and season fields

A read-only public probe of `/user/glp/diary?page=1` on 2026-10-12 returned
`showBannerImage` and `showSeasons` entries with `id`, `posterPath`, `name` and
`seasonNumber`. The diary normalizer previously read only top-level `posterPath`
and `seasonName`, so valid provider artwork was discarded and episodes lost
their season-aware route and diary merge identity.

Match the row's `seasonId` against `showSeasons`; never pick the first season
or interpret a season ID as a season number. Prefer its poster, then the
legacy top-level poster, then show artwork. Preserve numeric season 0, and
retain legacy season-name parsing when no matching numeric season is available.
Unknown seasons remain unknown rather than producing incorrect episode links.

Rows still lacking artwork can use the existing TMDB metadata query. Metadata
failure must not hide history or affect Serializd pagination. No proxy changes
are needed: the existing diary GET already carries these fields.
