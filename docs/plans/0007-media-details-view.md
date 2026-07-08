# Media Details View

## Goal

Let users tap any item in the unified feed to open a focused details screen with
metadata, provider-specific actions, and logging.

## Route

`src/app/details/[id].tsx` — Expo Router dynamic route keyed by the normalized
item id (e.g. `trakt-12345`). The route reads `id` from `useLocalSearchParams`,
looks up the item in the current feed data, and falls back to a provider fetch
if the item is not already cached.

## Data flow

1. **Primary source:** the details screen receives the `NormalizedMediaItem`
   from `useUnifiedFeed` by matching `id`. This covers the common case where the
   user taps a card they can already see.
2. **Fallback fetch:** if the item is not in memory (deep link, refresh, etc.),
   fetch it from the owning provider:
   - `trakt-*` ids → `GET /movies/:id` or `GET /shows/:id` via Trakt.
   - Future `anilist-*` ids → AniList `Media` query.
   - Future `letterboxd-*` ids → Letterboxd film details.

The fetch adapter lives next to the existing read adapters in
`src/lib/providers/trakt/details.ts` and normalizes to `NormalizedMediaItem` /
a new `MediaDetails` type.

## New types

```ts
// src/types/media.ts
export interface MediaDetails extends NormalizedMediaItem {
  overview?: string;
  year?: number;
  rating?: number; // normalized 0-10
  genres?: string[];
  runtimeMinutes?: number; // movies
  totalEpisodes?: number; // series (promoted from optional on base type)
}
```

`NormalizedMediaItem` keeps its current shape; `MediaDetails` widens it only for
 the details surface.

## UI

- **Poster hero:** large cover image at the top, title overlaid.
- **Metadata block:** year, runtime/episode count, genres, rating, overview.
- **Actions:**
  - **Log watched / +1 episode:** reuses the future `useLogMedia` fan-out
    (todos/005). Movies log once; TV increments the next episode.
  - **Disconnect / remove:** per-provider option surfaced from the registry.
- **Provider chips:** shows which connected providers apply to this item
  (derived from `providersForLog`).

## Navigation

- Tap a `MediaCard` in the feed to push `details/[id]`.
- Back button returns to the feed.
- Deep links like `shinobu://details/trakt-12345` open the details screen
  directly; the fallback fetch handles missing memory state.

## Dependencies

- `useLogMedia` (todos/005) for the log action.
- Provider-specific detail adapters for Trakt first; AniList/Letterboxd add
  theirs when those providers land.

## Out of scope for first pass

- Episode lists / season pickers.
- Reviews or notes.
- Related/similar recommendations.
