import { FORMAT_OPTIONS, matchesFormat, type FormatFilter } from '@/features/credit-timeline/group';
import { mergeCatalogueMetadata } from '@/lib/providers/merge-metadata';
import { nameKeys } from '@/lib/providers/pick-movie-match';
import type { ProviderId } from '@/lib/providers/types';
import { parseLocalInstant } from '@/lib/time/has-aired';
import type {
  DiaryDay,
  MediaType,
  MergedDiaryEntry,
  NormalizedDiaryEntry,
  NormalizedMediaItem,
  ReadingEvent,
} from '@/types/media';

export type DiaryFormat = FormatFilter | 'READING';

export const DIARY_FORMAT_OPTIONS = [
  ...FORMAT_OPTIONS,
  { value: 'READING', label: 'Reading' },
] as const satisfies readonly { value: DiaryFormat; label: string }[];

export function matchesDiaryFormat(item: NormalizedMediaItem, format: DiaryFormat): boolean {
  switch (format) {
    case 'READING':
      return item.type === 'MANGA' || item.type === 'BOOK';
    case 'ALL':
    case 'MOVIE':
    case 'TV':
      return matchesFormat(item, format);
  }
}

export interface DiaryProviderState {
  provider: ProviderId;
  entries: NormalizedDiaryEntry[];
  /** How far back the provider has paged; overrides `entries` for the watermark. */
  readTo?: string;
  hasMore: boolean;
  failed: boolean;
}

const PROVIDER_PRIORITY: Record<ProviderId, number> = {
  trakt: 0,
  simkl: 1,
  serializd: 2,
  anilist: 3,
  letterboxd: 4,
  hardcover: -1,
};

function entryMs(entry: Pick<NormalizedDiaryEntry, 'watchedAt'>): number {
  return parseLocalInstant(entry.watchedAt)?.getTime() ?? 0;
}

export function mergeDiaryEntries(states: readonly DiaryProviderState[]): NormalizedDiaryEntry[] {
  const byId = new Map<string, NormalizedDiaryEntry>();
  for (const state of states) {
    for (const entry of state.entries) {
      const existing = byId.get(entry.id);
      if (existing == null || entryMs(entry) > entryMs(existing)) {
        byId.set(entry.id, entry);
      }
    }
  }

  const watermark = computeWatermark(states);
  const entries = [...byId.values()];
  // Parsed once into a column: parsing inside the comparator re-parsed each
  // date ~16 times for 300 logs, nine-tenths of the merge on Hermes.
  const ms = entries.map(entryMs);
  return entries
    .map((_, index) => index)
    .filter((index) => watermark == null || ms[index] >= watermark)
    .sort((a, b) => ms[b] - ms[a])
    .map((index) => entries[index]);
}

/** Uses `readTo` when present (AniList filters out entries mid-page; Serializd pages by log time while entries carry backdates), else the oldest entry. */
function readFrontiers(
  states: readonly DiaryProviderState[],
): Array<{ provider: ProviderId; min: number }> {
  return states
    .filter((state) => state.hasMore && !state.failed)
    .flatMap((state) => {
      const readTo = state.readTo != null ? parseLocalInstant(state.readTo)?.getTime() : undefined;
      const min = readTo ?? Math.min(...state.entries.map(entryMs));
      return Number.isFinite(min) ? [{ provider: state.provider, min }] : [];
    });
}

function computeWatermark(states: readonly DiaryProviderState[]): number | null {
  const mins = readFrontiers(states).map((frontier) => frontier.min);
  return mins.length > 0 ? Math.max(...mins) : null;
}

export function watermarkProviders(states: readonly DiaryProviderState[]): ProviderId[] {
  const mins = readFrontiers(states);
  if (mins.length === 0) {
    return states.filter((state) => state.hasMore && !state.failed).map((state) => state.provider);
  }

  const watermark = Math.max(...mins.map((m) => m.min));
  return mins.filter((m) => m.min === watermark).map((m) => m.provider);
}

function titleYearKey(item: NormalizedDiaryEntry['item']): string {
  const title = item.title.trim().toLowerCase().replace(/\s+/g, ' ');
  return `ty:${title}:${item.year ?? '?'}`;
}

function identityKey(item: NormalizedDiaryEntry['item']): string {
  if (item.externalIds.tmdb != null) return `tmdb:${item.externalIds.tmdb}`;
  if (item.externalIds.imdb != null) return `imdb:${item.externalIds.imdb}`;
  return titleYearKey(item);
}

function counted(value: number, singular: string, plural = `${singular}s`): string {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

export interface DaySummary {
  label: string;
  units: number;
  chapters: number;
  bookIds: string[];
}

export function summarizeDay(entries: readonly MergedDiaryEntry[]): DaySummary {
  let films = 0;
  const books = new Set<string>();
  const anilistByMal = new Map<string, number>();
  for (const { item } of entries) {
    const { anilist, mal } = item.externalIds;
    if (anilist != null && mal != null) {
      anilistByMal.set(`${item.type === 'MANGA' ? 'manga' : 'show'}:${mal}`, anilist);
    }
  }
  // A fan-out log numbers one episode twice: TMDB's season/episode and the
  // AniList entry's own. The two schemes can't be joined, so a show counts
  // whichever describes more episodes.
  type Series = {
    keys: Set<string>;
    seasoned: Set<string>;
    unseasoned: Set<string>;
    manga: boolean;
  };
  const series = new Set<Series>();
  const byIdentity = new Map<string, Series>();
  for (const entry of entries) {
    const { item } = entry;
    if (item.type === 'MOVIE' || item.isFilm) {
      films++;
      continue;
    }
    if (item.type === 'BOOK') {
      books.add(item.id);
      continue;
    }
    const family = item.type === 'MANGA' ? 'manga' : 'show';
    const keys = identityKeys(item).map((key) => `${family}:${key}`);
    let group = byIdentity.get(keys[0]);
    for (const key of keys) {
      const match = byIdentity.get(key);
      if (match == null) continue;
      if (group == null) group = match;
      else if (group !== match) {
        for (const unit of match.seasoned) group.seasoned.add(unit);
        for (const unit of match.unseasoned) group.unseasoned.add(unit);
        for (const alias of match.keys) {
          group.keys.add(alias);
          byIdentity.set(alias, group);
        }
        series.delete(match);
      }
    }
    if (group == null) {
      group = {
        keys: new Set(),
        seasoned: new Set(),
        unseasoned: new Set(),
        manga: item.type === 'MANGA',
      };
      series.add(group);
    }
    for (const key of keys) {
      group.keys.add(key);
      byIdentity.set(key, group);
    }
    // Unseasoned anime numbers belong to the AniList/MAL entry, not season 1
    // of its TMDB show. Two cours can both contain episode 1.
    const anilist =
      item.externalIds.anilist ?? anilistByMal.get(`${family}:${item.externalIds.mal}`);
    const animeIdentity =
      anilist != null
        ? `anilist:${anilist}`
        : item.externalIds.mal != null
          ? `mal:${item.externalIds.mal}`
          : identityKey(item);
    for (const episode of entry.episodes) {
      if (entry.season != null) group.seasoned.add(`${entry.season}:${episode}`);
      else group.unseasoned.add(`${animeIdentity}:${episode}`);
    }
  }
  let shows = 0;
  let episodes = 0;
  let manga = 0;
  let chapters = 0;
  let units = films + books.size;
  for (const group of series) {
    const count = Math.max(group.seasoned.size, group.unseasoned.size);
    units += Math.max(count, 1);
    if (group.manga) {
      manga++;
      chapters += count;
    } else {
      shows++;
      episodes += count;
    }
  }
  const parts: string[] = [];
  if (films > 0) parts.push(counted(films, 'film'));
  if (shows > 0) {
    const titles = counted(shows, 'show');
    parts.push(episodes > 0 ? `${counted(episodes, 'episode')} of ${titles}` : titles);
  }
  if (manga > 0) {
    const titles = counted(manga, 'manga', 'manga');
    parts.push(chapters > 0 ? `${counted(chapters, 'chapter')} of ${titles}` : titles);
  }
  if (books.size > 0) parts.push(counted(books.size, 'book'));
  return { label: parts.join(' · '), units, chapters, bookIds: [...books] };
}

function identityKeys(item: NormalizedDiaryEntry['item']): string[] {
  const ids = item.externalIds;
  const keys: string[] = [];
  if (ids.tmdb != null) keys.push(`tmdb:${ids.tmdb}`);
  if (ids.tvdb != null) keys.push(`tvdb:${ids.tvdb}`);
  if (ids.imdb != null) keys.push(`imdb:${ids.imdb}`);
  if (ids.mal != null) keys.push(`mal:${ids.mal}`);
  if (ids.anilist != null) keys.push(`anilist:${ids.anilist}`);
  if (ids.hardcover != null) keys.push(`hardcover:${ids.hardcover}`);
  if (item.bridgedAniList != null) keys.push(`anilist:${item.bridgedAniList.id}`);
  if (keys.length === 0) keys.push(titleYearKey(item));
  return keys;
}

/** AniList and Simkl often omit TMDB IDs on anime films, so cross-provider matching falls back to year-scoped names. */
function filmNameKeys(item: NormalizedMediaItem): string[] {
  if ((item.type !== 'MOVIE' && item.isFilm !== true) || item.year == null) return [];
  return [...nameKeys(item)].map((name) => `name:${name}:${item.year}`);
}

function idsDisagree(a: NormalizedMediaItem, b: NormalizedMediaItem): boolean {
  return Object.entries(a.externalIds).some(([namespace, id]) => {
    const other = b.externalIds[namespace as keyof NormalizedMediaItem['externalIds']];
    return id != null && other != null && other !== id;
  });
}

function episodesKey(episodes: number[] | undefined): string {
  return [...(episodes ?? [])].sort((a, b) => a - b).join(',');
}

export function localDayKey(
  entry: Pick<NormalizedDiaryEntry, 'watchedAt' | 'dateOnly'>,
  timeZone: string,
): string {
  if (entry.dateOnly === true) return entry.watchedAt;
  const instant = parseLocalInstant(entry.watchedAt);
  if (instant == null) return entry.watchedAt;
  return dayKeyForInstant(instant, timeZone);
}

/** Cached per zone; `en-CA` formats dates as `YYYY-MM-DD`. */
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

export function dayKeyForInstant(instant: Date, timeZone: string): string {
  let formatter = dayFormatters.get(timeZone);
  if (formatter == null) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayFormatters.set(timeZone, formatter);
  }
  return formatter.format(instant);
}

interface CollapseBucket {
  providers: Set<ProviderId>;
  entries: NormalizedDiaryEntry[];
}

function toMerged(bucket: CollapseBucket): MergedDiaryEntry {
  const contributors = [...bucket.entries].sort(
    (a, b) => PROVIDER_PRIORITY[a.provider] - PROVIDER_PRIORITY[b.provider],
  );
  const primary = contributors[0];
  const item = contributors
    .slice(1)
    .reduce(
      (acc, entry) =>
        acc.type === 'BOOK' && entry.item.type !== 'BOOK'
          ? acc
          : mergeCatalogueMetadata(acc, entry.item),
      primary.item,
    );
  const episodes = [...new Set(contributors.flatMap((entry) => entry.episodes ?? []))].sort(
    (a, b) => a - b,
  );
  // A season numbers the primary's show only when their ids agree: a bridged
  // Serializd S2E3 is not season 2 of the cour Simkl files as its own show.
  const season = contributors.find(
    (entry) => entry.season != null && !idsDisagree(primary.item, entry.item),
  )?.season;
  const newest = contributors.reduce((a, b) => (entryMs(b) > entryMs(a) ? b : a));

  return {
    id: primary.id,
    providers: [...bucket.providers].sort((a, b) => PROVIDER_PRIORITY[a] - PROVIDER_PRIORITY[b]),
    item,
    sourceIds: [...new Set(contributors.map((entry) => entry.item.id))],
    episodes,
    ...(season != null ? { season } : {}),
    watchedAt: newest.watchedAt,
    dateOnly: contributors.every((entry) => entry.dateOnly === true),
    ...(contributors.some((entry) => entry.liked === true) ? { liked: true } : {}),
    ...(primary.readingEvent != null ? { readingEvent: primary.readingEvent } : {}),
    ...(primary.pages != null ? { pages: primary.pages } : {}),
    ...(primary.percent != null ? { percent: primary.percent } : {}),
  };
}

function sortMergedDesc(merged: MergedDiaryEntry[]): MergedDiaryEntry[] {
  const ms = merged.map(entryMs);
  return merged
    .map((_, index) => index)
    .sort((a, b) =>
      merged[a].dateOnly !== merged[b].dateOnly ? (merged[a].dateOnly ? 1 : -1) : ms[b] - ms[a],
    )
    .map((index) => merged[index]);
}

function collapseDay(entries: NormalizedDiaryEntry[]): MergedDiaryEntry[] {
  const buckets: Array<CollapseBucket | null> = [];
  const byIdentity = new Map<string, number[]>();
  const indexBucket = (bucket: number, key: string, identities: Iterable<string>) => {
    for (const identity of identities) {
      const slot = `${key}\u0000${identity}`;
      const indices = byIdentity.get(slot);
      if (indices == null) byIdentity.set(slot, [bucket]);
      else if (!indices.includes(bucket)) indices.push(bucket);
    }
  };
  for (const entry of entries) {
    const identities = [...identityKeys(entry.item), ...filmNameKeys(entry.item)];
    const key = episodesKey(entry.episodes);
    const matches = new Set<number>();
    for (const identity of identities) {
      for (const index of byIdentity.get(`${key}\u0000${identity}`) ?? []) {
        const bucket = buckets[index];
        if (
          bucket != null &&
          !bucket.providers.has(entry.provider) &&
          !(
            identity.startsWith('name:') &&
            bucket.entries.some((other) => idsDisagree(entry.item, other.item))
          )
        ) {
          matches.add(index);
        }
      }
    }
    const [match, ...bridged] = [...matches].sort((a, b) => a - b);
    const target = match == null ? undefined : buckets[match];
    if (match != null && target != null) {
      target.entries.push(entry);
      target.providers.add(entry.provider);
      indexBucket(match, key, identities);
      for (const index of bridged) {
        const other = buckets[index];
        if (
          other == null ||
          [...other.providers].some((provider) => target.providers.has(provider))
        )
          continue;
        target.entries.push(...other.entries);
        for (const provider of other.providers) target.providers.add(provider);
        indexBucket(
          match,
          key,
          other.entries.flatMap((joined) => [
            ...identityKeys(joined.item),
            ...filmNameKeys(joined.item),
          ]),
        );
        buckets[index] = null;
      }
    } else {
      buckets.push({ providers: new Set([entry.provider]), entries: [entry] });
      indexBucket(buckets.length - 1, key, identities);
    }
  }
  return sortMergedDesc(buckets.filter((bucket) => bucket != null).map(toMerged));
}

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

export interface DiaryCluster {
  key: string;
  entries: MergedDiaryEntry[];
}

export interface DiaryClusterSummary {
  item: NormalizedMediaItem;
  season?: number;
  episodes: number[];
  providers: ProviderId[];
  count: number;
}

function clusterKey(entry: MergedDiaryEntry): string | null {
  if (entry.episodes.length === 0) return null;
  return `${identityKey(entry.item)}::${entry.season ?? ''}`;
}

export function clusterDayEntries(entries: readonly MergedDiaryEntry[]): DiaryCluster[] {
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

export function summarizeCluster(cluster: DiaryCluster): DiaryClusterSummary {
  const episodes = [...new Set(cluster.entries.flatMap((entry) => entry.episodes))].sort(
    (a, b) => a - b,
  );
  const providers = [...new Set(cluster.entries.flatMap((entry) => entry.providers))].sort(
    (a, b) => PROVIDER_PRIORITY[a] - PROVIDER_PRIORITY[b],
  );
  const season = cluster.entries.find((entry) => entry.season != null)?.season;
  return {
    item: cluster.entries[0].item,
    ...(season != null ? { season } : {}),
    episodes,
    providers,
    count: episodes.length,
  };
}

function formatEpisodeRange(episodes: number[]): string {
  const sorted = [...new Set(episodes)].sort((a, b) => a - b);

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

const READING_EVENT_DETAIL: Record<ReadingEvent, string> = {
  started: 'Started',
  progressed: 'Updated progress',
  finished: 'Finished',
};

export function formatEpisodeDetail(params: {
  type: MediaType;
  season?: number;
  episodes: number[];
  readingEvent?: ReadingEvent;
  pages?: MergedDiaryEntry['pages'];
  percent?: MergedDiaryEntry['percent'];
  inPages?: boolean;
}): string {
  const { pages, percent } = params;
  if (pages != null && (params.inPages === true || percent == null)) {
    return pages.from < pages.to ? `Pages ${pages.from}–${pages.to}` : `Page ${pages.to}`;
  }
  if (percent != null) {
    return percent.from < percent.to
      ? `+${percent.to - percent.from}% (${percent.from}→${percent.to})`
      : `${percent.to}%`;
  }
  if (params.readingEvent != null) return READING_EVENT_DETAIL[params.readingEvent];
  if (params.episodes.length === 0) return '';
  const range = formatEpisodeRange(params.episodes);
  if (params.type === 'MANGA') return `Ch ${range}`;
  if (params.season != null) return `S${params.season}E${range}`;
  return `Ep ${range}`;
}

export function shortClusterCount(params: {
  item: Pick<NormalizedMediaItem, 'type'>;
  count: number;
}): string {
  if (params.item.type === 'MANGA') return `${params.count} ch`;
  return `${params.count} ${params.count === 1 ? 'ep' : 'eps'}`;
}

export function formatClusterCount(type: MediaType, count: number): string {
  const noun = type === 'MANGA' ? 'chapter' : 'episode';
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export interface DiaryDayParts {
  day: string;
  label: string;
  isToday: boolean;
}

export function formatDayParts(dayKey: string, todayKey: string): DiaryDayParts {
  const [year, month, day] = dayKey.split('-').map(Number);
  const dayLabel = `${day ?? ''}`;
  if (dayKey === todayKey) {
    return { day: dayLabel, label: 'Today', isToday: true };
  }
  const monthName = MONTHS_SHORT[(month ?? 1) - 1] ?? '';
  const currentYear = Number(todayKey.slice(0, 4));
  return {
    day: dayLabel,
    label: year === currentYear ? monthName : `${monthName} ${`${year}`.slice(2)}`,
    isToday: false,
  };
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatLogTime(
  entry: Pick<MergedDiaryEntry, 'watchedAt' | 'dateOnly'>,
  timeZone: string,
): string {
  if (entry.dateOnly) return '';
  const instant = parseLocalInstant(entry.watchedAt);
  if (instant == null) return '';
  let formatter = timeFormatters.get(timeZone);
  if (formatter == null) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    timeFormatters.set(timeZone, formatter);
  }
  return formatter.format(instant);
}
