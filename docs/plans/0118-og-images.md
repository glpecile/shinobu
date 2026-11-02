---
status: done
date: 2026-11-02
---

# 0118 — Link-preview images for the web app

Shared links showed no preview. Every dynamic route (`/details/*`, `/person/*`,
lists) answered **404** with a generic shell, and no page carried Open Graph tags.

## Decisions

- **KTD-1. Follow Bluesky's split.** bskyweb fills OG tags into the HTML per
  route, and bskyogcard renders cards with satori + resvg. Shinobu does both
  in the existing Worker: `worker/og.ts` injects tags into the static shell
  with `HTMLRewriter`, and `worker/og-image.tsx` renders
  `/og/<page path>.png`. It is a renderer, not a provider proxy, so it doesn't
  count against the four proxy exceptions.
- **KTD-2. Public metadata only, by allowlisted id.** TMDB (movies, TV,
  Serializd shows, IMDb ids, people, studios, episodes), AniList (media and
  staff), Simkl (`/search/id`), and public Letterboxd pages (a film's OG tags
  plus its JSON-LD poster, a list's OG collage). AniList bios keep only prose:
  `__Label:__` facts, headings, and link rows are dropped. Serializd lists come from its public list endpoint.
  Trakt needs the user's client id, so its links get the site card.
- **KTD-3. Static pages keep `+html.tsx` defaults:** the site card and their
  baked `<title>`.
- **KTD-4. One card layout.** A poster (or a fanned stack for lists) beside the
  title, eyebrow, and description. A card with no image leads with the 忍 mark.
  Backdrops appear only on cards without a poster, which keeps PNGs under
  ~500 KB.
- **KTD-5. Cache both layers.** Resolved metadata is cached for a day and PNGs
  for a week in the Cache API, so a preview and its image share one upstream read.

## Deploy

The Worker reads `EXPO_PUBLIC_TMDB_TOKEN` and `EXPO_PUBLIC_SIMKL_CLIENT_ID`
(the app's build var names, so `wrangler dev` picks them up from `.env.local`).
Set both with `wrangler secret put`. A render costs ~150 ms CPU, so it needs
the Workers Paid plan (`docs/solutions/og-images-on-workers.md`).
