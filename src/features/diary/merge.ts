import { mergeCatalogueMetadata } from '@/lib/providers/merge-metadata';
import type { ProviderId } from '@/lib/providers/types';
import { parseLocalInstant } from '@/lib/time/has-aired';
import type {
  DiaryDay,
  MediaType,
  MergedDiaryEntry,
  NormalizedDiaryEntry,
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
// carries only slug/title/year, so it sinks last.
const PROVIDER_PRIORITY: Record<ProviderId, number> = {
  trakt: 0,
  anilist: 1,
  letterboxd: 2,
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

/** Item identity for collapse: shared tmdb, else imdb, else title+year. */
function identityKey(item: NormalizedDiaryEntry['item']): string {
  if (item.externalIds.tmdb != null) return `tmdb:${item.externalIds.tmdb}`;
  if (item.externalIds.imdb != null) return `imdb:${item.externalIds.imdb}`;
  const title = item.title.trim().toLowerCase().replace(/\s+/g, ' ');
  return `ty:${title}:${item.year ?? '?'}`;
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
  identity: string;
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
    const identity = identityKey(entry.item);
    const key = episodesKey(entry.episodes);
    // Merge only with a *different* provider's entry of the same item + episode
    // set — two same-provider logs (binge day / rewatch) never collapse (R2/AE6),
    // and mismatched episode sets stay separate rows (KTD4).
    const bucket = buckets.find(
      (candidate) =>
        candidate.identity === identity &&
        candidate.episodesKey === key &&
        !candidate.providers.has(entry.provider),
    );
    if (bucket != null) {
      bucket.entries.push(entry);
      bucket.providers.add(entry.provider);
    } else {
      buckets.push({
        identity,
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
