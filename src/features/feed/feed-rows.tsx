
import { MediaCarousel } from '@/components/media-carousel';
import {
  animeSeasonLabel,
  type AnimeSeasonWindow,
} from '@/lib/providers/anilist/season';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useVisibleItems } from '@/state/prefs/hidden-items';
import { capFeedRow } from './row-cap';
import {
  useSuspenseSeasonalAnimeQuery,
  useSuspenseTrendingMoviesQuery,
  useSuspenseTrendingShowsQuery,
  useSuspenseYourWatchlistQuery,
} from '@/state/queries/use-unified-feed';
import { useSuspenseWatchlistQuery } from '@/features/watchlist/use-watchlist-entries';
import type { NormalizedMediaItem } from '@/types/media';

interface FeedRowCallbacks {
  onItemPress: (item: NormalizedMediaItem) => void;
  onItemActions: (item: NormalizedMediaItem) => void;
}

/**
 * The home feed rows, one per feed slot. Each is a self-contained suspense
 * section (AGENTS.md "Loading & Error States"): it owns its query, applies
 * the hidden-items filter, and is mounted by the screen under its own
 * `SuspenseSection` — one provider failing or loading slowly never blocks or
 * blanks the rows around it.
 */

/**
 * The row whose source is **every** connected provider's watchlist, merged
 * (plan 0031 R25). No `provider` mark and no `username`: it is not one
 * provider's row, which is why a Trakt-only or AniList-only user sees it at
 * all. Its single `SuspenseSection` is unchanged and still correct — one row is
 * one slot; the merged *grid*'s per-leg failure handling is the divergence, and
 * it lives on the screen (KTD-12).
 *
 * It does **not** replace `LetterboxdWatchlistRow` below. Plan 0031 originally
 * had it do so; the owner reversed that on 2026-07-28, and the reason holds up:
 * merged with Trakt shows and AniList plans, a curated Letterboxd film list
 * stops being browsable as itself. Two rows, two questions.
 */
export function YourWatchlistRow({
  onItemPress,
  onItemActions,
}: FeedRowCallbacks) {
  const { entries } = useSuspenseWatchlistQuery();
  const pushRoute = usePushRoute();
  // Capped like the other unbounded personal row: a Trakt watchlist is
  // routinely hundreds of items and this is browse, not the archive — the
  // whole list is one "View all" away.
  const items = capFeedRow(entries.map((entry) => entry.item));
  return (
    <MediaCarousel
      collapseKey="your-watchlist"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
      onViewAll={() => pushRoute(routes.watchlist())}
      title="Up Next to Watch"
    />
  );
}

/**
 * Letterboxd's own films-only watchlist row (restored 2026-07-28 by owner
 * decision — plan 0031 R25 had folded it into the merged row above).
 *
 * Distinct from that row in every way that matters to a reader: it keeps the
 * `provider` mark — which is also why the title does **not** name Letterboxd
 * (the icon beside it already does; owner note 2026-07-29) — and it carries its
 * own `collapseKey` so collapsing one never collapses the other. The overlap is
 * the point, not a bug — a Letterboxd film appears in both, answering "what's on
 * my Letterboxd" here and "what am I meaning to watch" above.
 *
 * Its "View all" used to open a whole second screen (`/watchlist/letterboxd`);
 * since 2026-08-01 it opens the merged grid pre-filtered to Letterboxd, which
 * is the same view without the duplicate surface — and the user can widen it
 * from there.
 *
 * Reads page 1 only (28 films); the rest lives behind the paginated grid
 * (plan 0024 U9). No extra request — the merged gather already reads this same
 * cache entry.
 */
export function LetterboxdWatchlistRow({
  username,
  onItemPress,
  onItemActions,
}: FeedRowCallbacks & { username: string }) {
  const { data } = useSuspenseYourWatchlistQuery(username);
  const pushRoute = usePushRoute();
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="letterboxd-watchlist"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
      onViewAll={() => pushRoute(routes.watchlist('letterboxd'))}
      provider="letterboxd"
      title="Your Watchlist"
    />
  );
}

export function TrendingMoviesRow({
  onItemPress,
  onItemActions,
}: FeedRowCallbacks) {
  const { data } = useSuspenseTrendingMoviesQuery();
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="trending-movies"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
      provider="simkl"
      title="Trending Movies"
    />
  );
}

export function TrendingShowsRow({
  onItemPress,
  onItemActions,
}: FeedRowCallbacks) {
  const { data } = useSuspenseTrendingShowsQuery();
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="trending-shows"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
      provider="simkl"
      title="Trending TV Shows"
    />
  );
}

export function SeasonalAnimeRow({
  season,
  onItemPress,
  onItemActions,
}: FeedRowCallbacks & { season: AnimeSeasonWindow }) {
  const { data } = useSuspenseSeasonalAnimeQuery(season);
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="seasonal-anime"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
      provider="anilist"
      title={`${animeSeasonLabel(season)} Anime`}
    />
  );
}
