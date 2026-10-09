# Provider-qualified resource routes

## Scope

- Move detail and episode identities from provider-prefixed item IDs to
  `/details/[provider]/[id]` and `/episode/[provider]/[id]/[...episode]`.
  Preserve hyphens within IDs (including TMDB's `movie-` / `tv-` discriminator).
- Address tracker episodes by season/number path segments, and entry-relative
  anime episodes by a single number. Keep native pager updates on the same
  screen with `setParams`.
- Move AniList's incoming manga hint into a trailing `/manga` detail segment.
- Trakt IDs overlap across movie/show namespaces: new links carry `/movie` or
  `/tv`, and cold reads use the existing typed ID lookup. Uncached old links
  ask the viewer to choose rather than silently opening a namesake.
- Resolve cold Serializd links through their TMDB TV ID using the existing
  public Simkl lookup, preserving that TMDB identity for metadata and writes.
- Qualify people and studios by their metadata provider. Move name lookups
  from `?name=` to `/lookup/[name]` with encoded names.
- Redirect old shared resource URLs, as the lists PR does. Leave UI filters
  (watchlist provider, search, list kind, anime season/year/format) as queries.
- Keep normalized item IDs, caches, provider reads, OAuth, and notifications'
  stored item IDs unchanged. New notifications include the media type.
  No dependencies or native configuration changes.
- Extend the existing route-centralization oxlint rule to cover router/push
  aliases, computed method access, variable-held destinations, and relative
  strings in redirects. Keep external URLs exempt.

## Validation

Extend existing route/incoming-link and episode-link checks; run the full test
suite, lint, typecheck, class-name/navigation checks, and production web export.
Verify route matching, legacy redirects, and episode stepping in the app.
JS-only changes hot reload; no native clean build is needed.
