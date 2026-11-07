import type { MediaProgress } from '@/lib/media-progress';
import { hasAired, parseLocalInstant } from '@/lib/time/has-aired';
import { formatLocalTime, localDayOffset, shortWeekdayName } from '@/lib/time/relative-day';
import type { NormalizedMediaItem } from '@/types/media';

export interface NextAiring {
  episode: number;
  /** ISO instant. */
  airingAt: string;
}

/** Where a season's titles fold, in screen order; `rest` holds everything untracked. */
export const SEASON_SHELVES = ['watching', 'planned', 'seen', 'rest'] as const;
export type SeasonShelf = (typeof SEASON_SHELVES)[number];

/** What a library holds about a title, beyond the progress it reports. */
export type LibraryStatus = 'watching' | 'planned' | undefined;

/**
 * Seen wins over everything, so a finished show never reads as in progress.
 * Any progress is Watching, as is a list status that says so before the first
 * episode is logged.
 */
export function seasonShelf(progress: MediaProgress, status: LibraryStatus): SeasonShelf {
  if (progress.completed) return 'seen';
  if (progress.watched || status === 'watching') return 'watching';
  return status === 'planned' ? 'planned' : 'rest';
}

export type SeasonRow =
  | { kind: 'head'; key: SeasonShelf; count: number; open: boolean; next?: NextAiring }
  | { kind: 'posters'; key: string; shelf: SeasonShelf; items: readonly NormalizedMediaItem[] }
  | { kind: 'entry'; key: string; shelf: SeasonShelf; item: NormalizedMediaItem };

/**
 * The flat row stream the season list virtualizes: a head per shelf with its
 * titles under it, posters chunked into rows of `columns` for the grid or one
 * row per title for the list. A folded head keeps its titles out.
 *
 * With nothing on a tracked shelf, the stream is the plain catalogue with no
 * heads, which is the explorer as it was before shelves. Watching and the
 * watchlist sort by the next episode, soonest first, after which unscheduled
 * titles keep the catalogue's popularity order.
 */
export function seasonRows(
  items: readonly NormalizedMediaItem[],
  shelfOf: (item: NormalizedMediaItem) => SeasonShelf,
  nextAiring: Readonly<Record<string, NextAiring>>,
  options: { folded: ReadonlySet<SeasonShelf>; columns?: number; now: Date },
): SeasonRow[] {
  const shelves = new Map<SeasonShelf, NormalizedMediaItem[]>(SEASON_SHELVES.map((shelf) => [shelf, []]));
  for (const item of items) shelves.get(shelfOf(item))?.push(item);
  const upcoming = (item: NormalizedMediaItem) => {
    const next = nextAiring[item.id];
    return next != null && !hasAired(next.airingAt, options.now) ? next : undefined;
  };
  const at = (item: NormalizedMediaItem) => upcoming(item)?.airingAt ?? '￿';
  for (const shelf of ['watching', 'planned'] as const) shelves.get(shelf)?.sort((a, b) => at(a).localeCompare(at(b)));
  const tracked = items.length - (shelves.get('rest')?.length ?? 0) > 0;

  const rows: SeasonRow[] = [];
  for (const [shelf, group] of shelves) {
    if (group.length === 0) continue;
    const open = !tracked || !options.folded.has(shelf);
    if (tracked) {
      const next = shelf === 'watching' || shelf === 'planned' ? upcoming(group[0]) : undefined;
      rows.push({ kind: 'head', key: shelf, count: group.length, open, ...(next != null ? { next } : {}) });
    }
    if (!open) continue;
    const { columns } = options;
    if (columns == null) {
      for (const item of group) rows.push({ kind: 'entry', key: `${shelf}-${item.id}`, shelf, item });
      continue;
    }
    for (let index = 0; index < group.length; index += columns) {
      rows.push({ kind: 'posters', key: `${shelf}-posters-${index}`, shelf, items: group.slice(index, index + columns) });
    }
  }
  return rows;
}

/**
 * When the next episode airs, in the user's timezone: "E7 · Today 21:30",
 * "Premiere · Fri 09:00", or "E8 · Sat, Nov 14" once it is a week or more out. Undefined
 * once it has aired, since AniList's pointer can trail a cached page.
 */
export function airingNote(next: NextAiring | undefined, now: Date): string | undefined {
  if (next == null || hasAired(next.airingAt, now)) return undefined;
  // `E7`, not `Ep 7`: a phone poster is ~120pt, and the time is what matters.
  const episode = next.episode === 1 ? 'Premiere' : `E${next.episode}`;
  return `${episode} · ${airingWhen(next.airingAt, now)}`;
}

/** The when half of `airingNote`, also the folded head's "next …" summary. */
export function airingWhen(airingAt: string, now: Date): string {
  const offset = localDayOffset(airingAt, now) ?? 0;
  const date = parseLocalInstant(airingAt) ?? now;
  // A week out the weekday alone repeats this week's, so the date joins it.
  if (offset >= 7) return `${shortWeekdayName(date)}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
  const day = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : shortWeekdayName(date);
  const time = formatLocalTime(airingAt);
  return time == null ? day : `${day} ${time}`;
}

// Hardcoded like `relative-day`'s weekdays: identical output on every platform and locale.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
