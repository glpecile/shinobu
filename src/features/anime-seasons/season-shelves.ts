import type { MediaProgress } from '@/lib/media-progress';
import { hasAired, parseLocalInstant } from '@/lib/time/has-aired';
import { formatLocalTime, localDayOffset, shortWeekdayName } from '@/lib/time/relative-day';
import type { NormalizedMediaItem } from '@/types/media';

export interface NextAiring {
  episode: number;
  /** ISO instant. */
  airingAt: string;
}

export const SEASON_SHELVES = ['watching', 'planned', 'seen', 'rest'] as const;
export type SeasonShelf = (typeof SEASON_SHELVES)[number];

export type LibraryStatus = 'watching' | 'planned' | undefined;

export function seasonShelf(progress: MediaProgress, status: LibraryStatus): SeasonShelf {
  if (progress.completed) return 'seen';
  if (progress.watched || status === 'watching') return 'watching';
  return status === 'planned' ? 'planned' : 'rest';
}

export type SeasonRow =
  | { kind: 'head'; key: SeasonShelf; count: number; open: boolean; next?: NextAiring }
  | { kind: 'posters'; key: string; shelf: SeasonShelf; items: readonly NormalizedMediaItem[] }
  | { kind: 'entry'; key: string; shelf: SeasonShelf; item: NormalizedMediaItem };

export function seasonRows(
  items: readonly NormalizedMediaItem[],
  shelfOf: (item: NormalizedMediaItem) => SeasonShelf,
  nextAiring: Readonly<Record<string, NextAiring>>,
  options: { folded: ReadonlySet<SeasonShelf>; columns?: number; now: Date },
): SeasonRow[] {
  const shelves = new Map<SeasonShelf, NormalizedMediaItem[]>(
    SEASON_SHELVES.map((shelf) => [shelf, []]),
  );
  for (const item of items) shelves.get(shelfOf(item))?.push(item);
  const upcoming = (item: NormalizedMediaItem) => {
    const next = nextAiring[item.id];
    return next != null && !hasAired(next.airingAt, options.now) ? next : undefined;
  };
  const at = (item: NormalizedMediaItem) => upcoming(item)?.airingAt ?? '￿';
  for (const shelf of ['watching', 'planned'] as const)
    shelves.get(shelf)?.sort((a, b) => at(a).localeCompare(at(b)));
  const tracked = items.length - (shelves.get('rest')?.length ?? 0) > 0;

  const rows: SeasonRow[] = [];
  for (const [shelf, group] of shelves) {
    if (group.length === 0) continue;
    const open = !tracked || !options.folded.has(shelf);
    if (tracked) {
      const next = shelf === 'watching' || shelf === 'planned' ? upcoming(group[0]) : undefined;
      rows.push({
        kind: 'head',
        key: shelf,
        count: group.length,
        open,
        ...(next != null ? { next } : {}),
      });
    }
    if (!open) continue;
    const { columns } = options;
    if (columns == null) {
      for (const item of group)
        rows.push({ kind: 'entry', key: `${shelf}-${item.id}`, shelf, item });
      continue;
    }
    for (let index = 0; index < group.length; index += columns) {
      rows.push({
        kind: 'posters',
        key: `${shelf}-posters-${index}`,
        shelf,
        items: group.slice(index, index + columns),
      });
    }
  }
  return rows;
}

export function airingNote(next: NextAiring | undefined, now: Date): string | undefined {
  if (next == null || hasAired(next.airingAt, now)) return undefined;
  const episode = next.episode === 1 ? 'Premiere' : `E${next.episode}`;
  return `${episode} · ${airingWhen(next.airingAt, now)}`;
}

export function airingWhen(airingAt: string, now: Date): string {
  const offset = localDayOffset(airingAt, now) ?? 0;
  const date = parseLocalInstant(airingAt) ?? now;
  if (offset >= 7) return `${shortWeekdayName(date)}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
  const day = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : shortWeekdayName(date);
  const time = formatLocalTime(airingAt);
  return time == null ? day : `${day} ${time}`;
}

// Hardcoded for identical output across platforms and locales.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
