# Provider list progress

- Fix the shared watched eye to consult all connected providers, including
  completed AniList films and Letterboxd's public member-film watched page.
  Never infer a watch from the mere presence of a catalogue record.
- Reuse account-wide Simkl, Trakt and Serializd caches. Add one AniList library
  snapshot (anime and manga, all statuses), not one request per poster.
- AniList matches exact IDs first. Movie cross-matches require one exact
  title/alias and year match; ambiguous matches stay unknown.
- Letterboxd reads public member-film pages by exact slug; TMDB-origin movies
  resolve through Letterboxd's exact TMDB redirect. Extend only those bounded
  GET paths in the existing read proxy after verifying them live.
- One progress selector supplies the watched eye, per-title numeric progress,
  and list summaries. Film watches count as completion. A begun series does
  not count as completed. Unknown totals never become invented percentages;
  Serializd's season-level history stays season-level.
- List summaries describe loaded titles, not unseen pages. Serializd summaries
  count distinct series rather than treating episode rows as completed shows.
- Show a small progress ring and literal episode/chapter count on partially
  watched posters/rows, plus an inline ring beside the film/show count.
  Keep watchlist/explorer behavior unchanged unless they opt in.
- Validate provider parsing, identity and completion selection, repository
  checks, and the signed-in screen. JS-only; web needs the updated read proxy.
