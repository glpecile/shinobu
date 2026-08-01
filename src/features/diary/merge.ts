import { mergeCatalogueMetadata } from '@/lib/providers/merge-metadata';
import type { ProviderId } from '@/lib/providers/types';
import { parseLocalInstant } from '@/lib/time/has-aired';
import type {
  DiaryDay,
  MediaType,
  MergedDiaryEntry,
  NormalizedDiaryEntry,
  NormalizedMediaItem,
} from '@/types/media';

/**
 * The unified-diary merge + grouping algorithm (plan 0016 KTD3/KTD4) — the risk
 * core of the feature, kept pure and unit-tested here. Per-provider infinite
 * cursors feed `mergeDiaryEntries` (dedup → watermark cut → sort); the resulting
 * gapless stream feeds `groupDiaryEntries` (day buckets + cross-provider
 * collapse). No Effect, no React — the hook is thin plumbing around this.
 */

/** One provider's loaded-so-far slice of the diary and its pagination state. */
export interface DiaryProviderState {
  provider: ProviderId;
  /** Every entry loaded across pages so far (order irrelevant — sorted here). */
  entries: NormalizedDiaryEntry[];
  /** More pages remain to fetch (false when exhausted OR failed). */
  hasMore: boolean;
  /** This provider's initial or pagination fetch failed. */
  failed: boolean;
}

// Precedence when the same log lands on several providers: the richest metadata
// source wins the display item, deterministically regardless of match order
// (plan 0016 KTD4). Trakt/AniList carry full catalogue metadata; Letterboxd RSS
// carries only slug/title/year, so it sinks last. Serializd diary rows carry
// show/season/episode detail (richer than Letterboxd RSS), so they rank
// directly after Trakt (plan 0017 U1). Simkl all-items rows sit between them:
// full catalogue metadata plus the widest external-id bridge
// (simkl/tmdb/tvdb/imdb/mal/anilist — plan 0034 KTD-6), so a collapsed row's
// display item keeps every join key the contributors offered.
const PROVIDER_PRIORITY: Record<ProviderId, number> = {
  trakt: 0,
  simkl: 1,
  serializd: 2,
  anilist: 3,
  letterboxd: 4,
};

/** A diary entry's ordering key in epoch ms (date-only → local midnight). */
function entryMs(entry: NormalizedDiaryEntry): number {
  return parseLocalInstant(entry.watchedAt)?.getTime() ?? 0;
}

/**
 * Deduplicates by log id (newest occurrence wins), applies the watermark cut,
 * and sorts descending (plan 0016 KTD3). The watermark is the newest
 * "oldest-loaded" instant among providers that still have more pages — no entry
 * older than it is exposed, since a not-yet-fetched page of that provider could
 * still fill the gap. Failed and exhausted providers drop out of the watermark.
 */
export function mergeDiaryEntries(
  states: readonly DiaryProviderState[],
): NormalizedDiaryEntry[] {
  const byId = new Map<string, NormalizedDiaryEntry>();
  for (const state of states) {
    for (const entry of state.entries) {
      const existing = byId.get(entry.id);
      // Page N+1 re-returns page N's tail after a prepend — same id, same log.
      // Keep the newer occurrence (identical in practice; robust to edits).
      if (existing == null || entryMs(entry) > entryMs(existing)) {
        byId.set(entry.id, entry);
      }
    }
  }

  const watermark = computeWatermark(states);
  const cut =
    watermark == null
      ? [...byId.values()]
      : [...byId.values()].filter((entry) => entryMs(entry) >= watermark);

  return cut.sort((a, b) => entryMs(b) - entryMs(a));
}

/** The watermark instant (epoch ms), or null when nobody has more pages. */
function computeWatermark(
  states: readonly DiaryProviderState[],
): number | null {
  const mins = states
    .filter((state) => state.hasMore && !state.failed && state.entries.length > 0)
    .map((state) => Math.min(...state.entries.map(entryMs)));
  return mins.length > 0 ? Math.max(...mins) : null;
}

/**
 * Which provider(s) sit at the watermark and must advance on `fetchNextPage`
 * (plan 0016 KTD3): the ones whose oldest-loaded entry defines the current cut.
 * Advancing them lowers the watermark and releases held-back entries. Providers
 * with more pages but nothing loaded yet advance too (cold start).
 */
export function watermarkProviders(
  states: readonly DiaryProviderState[],
): ProviderId[] {
  const withMore = states.filter((state) => state.hasMore && !state.failed);
  const loaded = withMore.filter((state) => state.entries.length > 0);
  if (loaded.length === 0) return withMore.map((state) => state.provider);

  const mins = loaded.map((state) => ({
    provider: state.provider,
    min: Math.min(...state.entries.map(entryMs)),
  }));
  const watermark = Math.max(...mins.map((m) => m.min));
  return mins.filter((m) => m.min === watermark).map((m) => m.provider);
}

// ---- Grouping (day buckets + cross-provider collapse) ----

/** The title+year identity of last resort, normalized for casing/whitespace. */
function titleYearKey(item: NormalizedDiaryEntry['item']): string {
  const title = item.title.trim().toLowerCase().replace(/\s+/g, ' ');
  return `ty:${title}:${item.year ?? '?'}`;
}

/**
 * Item identity for within-day *clustering*: shared tmdb, else imdb, else
 * title+year. Clustering runs over already-collapsed entries whose external
 * ids were unioned by `toMerged`, so the single-key chain suffices there.
 */
function identityKey(item: NormalizedDiaryEntry['item']): string {
  if (item.externalIds.tmdb != null) return `tmdb:${item.externalIds.tmdb}`;
  if (item.externalIds.imdb != null) return `imdb:${item.externalIds.imdb}`;
  return titleYearKey(item);
}

/**
 * Namespaced identity keys for the cross-provider *collapse* join. TMDB alone
 * is not enough (the up-next lesson, plan 0034 U9.5): an AniList log states
 * anilist/mal but rarely tmdb, Serializd states only tmdb — and a Simkl
 * all-items row states most of them at once, bridging the two. The join
 * therefore matches on *any* shared namespaced id; the title+year fallback
 * applies only when an item carries no usable id at all, so an id-bearing
 * item never collapses with a same-titled different id (the pre-existing
 * fallback contract, unchanged).
 */
function identityKeys(item: NormalizedDiaryEntry['item']): string[] {
  const ids = item.externalIds;
  const keys: string[] = [];
  if (ids.tmdb != null) keys.push(`tmdb:${ids.tmdb}`);
  if (ids.tvdb != null) keys.push(`tvdb:${ids.tvdb}`);
  if (ids.imdb != null) keys.push(`imdb:${ids.imdb}`);
  if (ids.mal != null) keys.push(`mal:${ids.mal}`);
  if (ids.anilist != null) keys.push(`anilist:${ids.anilist}`);
  if (keys.length === 0) keys.push(titleYearKey(item));
  return keys;
}

/** The episode/chapter set signature; movies collapse on "no episodes". */
function episodesKey(episodes: number[] | undefined): string {
  return [...(episodes ?? [])].sort((a, b) => a - b).join(',');
}

/** Local `YYYY-MM-DD` day for an entry (date-only entries pass through). */
export function localDayKey(
  entry: NormalizedDiaryEntry,
  timeZone: string,
): string {
  if (entry.dateOnly === true) return entry.watchedAt;
  const instant = parseLocalInstant(entry.watchedAt);
  if (instant == null) return entry.watchedAt;
  return dayKeyForInstant(instant, timeZone);
}

/** en-CA renders an instant in `timeZone` as `YYYY-MM-DD`. */
function dayKeyForInstant(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

interface CollapseBucket {
  /** Union of every contributor's identity keys — later entries join on any
   *  overlap, so an id-rich contributor (Simkl) bridges id-poor ones. */
  identities: Set<string>;
  episodesKey: string;
  providers: Set<ProviderId>;
  entries: NormalizedDiaryEntry[];
}

function toMerged(bucket: CollapseBucket): MergedDiaryEntry {
  const contributors = [...bucket.entries].sort(
    (a, b) => PROVIDER_PRIORITY[a.provider] - PROVIDER_PRIORITY[b.provider],
  );
  const primary = contributors[0];
  // Fill-only fold from the richest contributor down — merge-metadata precedence
  // (plan 0016 KTD4): the primary's fields win, poorer contributors fill gaps
  // and union external ids, so the result is order-independent.
  const item = contributors
    .slice(1)
    .reduce((acc, entry) => mergeCatalogueMetadata(acc, entry.item), primary.item);
  const episodes = [
    ...new Set(contributors.flatMap((entry) => entry.episodes ?? [])),
  ].sort((a, b) => a - b);
  const season = contributors.find((entry) => entry.season != null)?.season;
  const newest = contributors.reduce((a, b) => (entryMs(b) > entryMs(a) ? b : a));

  return {
    id: primary.id,
    providers: [...bucket.providers].sort(
      (a, b) => PROVIDER_PRIORITY[a] - PROVIDER_PRIORITY[b],
    ),
    item,
    episodes,
    ...(season != null ? { season } : {}),
    watchedAt: newest.watchedAt,
    dateOnly: contributors.every((entry) => entry.dateOnly === true),
  };
}

/** Within-day order: instant entries newest-first, then date-only entries. */
function compareMergedDesc(a: MergedDiaryEntry, b: MergedDiaryEntry): number {
  if (a.dateOnly !== b.dateOnly) return a.dateOnly ? 1 : -1;
  return (
    (parseLocalInstant(b.watchedAt)?.getTime() ?? 0) -
    (parseLocalInstant(a.watchedAt)?.getTime() ?? 0)
  );
}

function collapseDay(entries: NormalizedDiaryEntry[]): MergedDiaryEntry[] {
  const buckets: CollapseBucket[] = [];
  for (const entry of entries) {
    const identities = identityKeys(entry.item);
    const key = episodesKey(entry.episodes);
    // Merge only with a *different* provider's entry of the same item + episode
    // set — two same-provider logs (binge day / rewatch) never collapse (R2/AE6),
    // and mismatched episode sets stay separate rows (KTD4). Identity matches
    // on any shared namespaced id (U9.5); joining unions the keys, so entries
    // are processed newest-first deterministically and a bridge contributor
    // extends the bucket's reach.
    const bucket = buckets.find(
      (candidate) =>
        candidate.episodesKey === key &&
        !candidate.providers.has(entry.provider) &&
        identities.some((identity) => candidate.identities.has(identity)),
    );
    if (bucket != null) {
      bucket.entries.push(entry);
      bucket.providers.add(entry.provider);
      for (const identity of identities) bucket.identities.add(identity);
    } else {
      buckets.push({
        identities: new Set(identities),
        episodesKey: key,
        providers: new Set([entry.provider]),
        entries: [entry],
      });
    }
  }
  return buckets.map(toMerged).sort(compareMergedDesc);
}

/**
 * Groups a merged, cut diary stream into day buckets (newest day first) with
 * cross-provider same-item collapse (plan 0016 KTD4). Day keys are the user's
 * local calendar day in `timeZone` — a UTC-evening instant lands on the prior
 * local day for a negative-offset zone (AE4).
 */
export function groupDiaryEntries(
  entries: readonly NormalizedDiaryEntry[],
  timeZone: string,
): DiaryDay[] {
  const byDay = new Map<string, NormalizedDiaryEntry[]>();
  for (const entry of entries) {
    const key = localDayKey(entry, timeZone);
    const bucket = byDay.get(key);
    if (bucket == null) byDay.set(key, [entry]);
    else bucket.push(entry);
  }

  return [...byDay.entries()]
    .map(([key, dayEntries]) => ({ key, entries: collapseDay(dayEntries) }))
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

// ---- Within-day episode clustering (presentation only) ----

/**
 * A run of same-show episode logs from one day, gathered into a collapsible
 * group so a binge (S6E1…E10) reads as one row instead of ten. Purely a
 * presentation grouping *over* `MergedDiaryEntry` — it never re-merges logs, so
 * the merge layer's contracts (per-log identity, cross-provider collapse,
 * rewatch/partial-failure separation) are untouched. A single-entry cluster is
 * just an ordinary row; only clusters of two or more collapse.
 */
export interface DiaryCluster {
  /** Stable key — the anchor (newest) entry's log id. */
  key: string;
  /** The grouped entries, newest-first. Length ≥ 1. */
  entries: MergedDiaryEntry[];
}

/** The collapsed summary of a cluster (union across its entries). */
export interface DiaryClusterSummary {
  /** Display item — the anchor (newest) entry's, richest of the run. */
  item: NormalizedMediaItem;
  /** Season shared by the run (TV); absent for anime/manga without one. */
  season?: number;
  /** Union of every entry's episode/chapter numbers, sorted ascending. */
  episodes: number[];
  /** Union of every provider that logged any entry, precedence-ordered. */
  providers: ProviderId[];
  /** How many episode/chapter numbers the run covers (union size). */
  count: number;
}

/**
 * A cluster identity — same show (identity) + same season — or null for rows
 * that must never fold together: movies and season-level logs (no episodes)
 * are each their own entry, exactly as the merge layer left them.
 */
function clusterKey(entry: MergedDiaryEntry): string | null {
  if (entry.episodes.length === 0) return null;
  return `${identityKey(entry.item)}::${entry.season ?? ''}`;
}

/**
 * Groups one day's already-collapsed entries into episode clusters, anchoring
 * each cluster at its newest member's position (input is newest-first, so the
 * anchor is the first occurrence) and preserving that relative order. Entries
 * that share a show + season fold together even if interleaved with another
 * show's logs; movies and season-level logs always pass through as singletons.
 */
export function clusterDayEntries(
  entries: readonly MergedDiaryEntry[],
): DiaryCluster[] {
  const clusters: DiaryCluster[] = [];
  const byKey = new Map<string, DiaryCluster>();
  for (const entry of entries) {
    const key = clusterKey(entry);
    const existing = key == null ? undefined : byKey.get(key);
    if (existing != null) {
      existing.entries.push(entry);
      continue;
    }
    const cluster: DiaryCluster = { key: entry.id, entries: [entry] };
    if (key != null) byKey.set(key, cluster);
    clusters.push(cluster);
  }
  return clusters;
}

/** The collapsed-row summary for a cluster: unioned episodes/providers + count. */
export function summarizeCluster(cluster: DiaryCluster): DiaryClusterSummary {
  const episodes = [
    ...new Set(cluster.entries.flatMap((entry) => entry.episodes)),
  ].sort((a, b) => a - b);
  const providers = [
    ...new Set(cluster.entries.flatMap((entry) => entry.providers)),
  ].sort((a, b) => PROVIDER_PRIORITY[a] - PROVIDER_PRIORITY[b]);
  const season = cluster.entries.find((entry) => entry.season != null)?.season;
  return {
    item: cluster.entries[0].item,
    ...(season != null ? { season } : {}),
    episodes,
    providers,
    count: episodes.length,
  };
}

// ---- Presentation helpers (pure) ----

/** "3–5" for a contiguous run, "2, 5" across a gap (plan 0016 KTD2). */
export function formatEpisodeRange(episodes: number[]): string {
  const sorted = [...new Set(episodes)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    if (current != null) {
      start = current;
      prev = current;
    }
  }
  return parts.join(', ');
}

/** The row's detail line: "S2E5" / "Ep 3–5" / "Ch 41"; '' for a movie. */
export function formatEpisodeDetail(params: {
  type: MediaType;
  season?: number;
  episodes: number[];
}): string {
  if (params.episodes.length === 0) return '';
  const range = formatEpisodeRange(params.episodes);
  if (params.type === 'MANGA') return `Ch ${range}`;
  if (params.season != null) return `S${params.season}E${range}`;
  return `Ep ${range}`;
}

/** "10 episodes" / "12 chapters" — the count line under a collapsed cluster. */
export function formatClusterCount(type: MediaType, count: number): string {
  const noun = type === 'MANGA' ? 'chapter' : 'episode';
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * The day header: "Today", "July 20", or "July 20, 2025" — the year appends only
 * when the day's local calendar year differs from the current one (R8), since
 * multi-year scroll-back otherwise repeats identical headers.
 */
export function formatDayHeader(
  dayKey: string,
  now: Date,
  timeZone: string,
): string {
  const todayKey = dayKeyForInstant(now, timeZone);
  if (dayKey === todayKey) return 'Today';

  const [year, month, day] = dayKey.split('-').map(Number);
  const monthName = MONTHS[(month ?? 1) - 1] ?? '';
  const currentYear = Number(todayKey.slice(0, 4));
  return year === currentYear
    ? `${monthName} ${day}`
    : `${monthName} ${day}, ${year}`;
}
