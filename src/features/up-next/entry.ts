import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';

import type { UpNextEntry, UpNextRelease } from './types';

/** ISO instant for an episode, or bare `YYYY-MM-DD` for a release (unnormalized so `lib/time` preserves `isDateOnly`). */
export function entryInstant(entry: UpNextEntry): string | undefined {
  return entry.kind === 'episode' ? entry.episode.firstAired : entry.release.date;
}

const RELEASE_LABELS: Record<UpNextRelease['kind'], string> = {
  digital: 'Streaming',
  physical: 'Physical release',
  theatrical: 'In theaters',
};

export function entryLabel(entry: UpNextEntry): string {
  if (entry.kind === 'release') return RELEASE_LABELS[entry.release.kind];
  const { season, number, title } = entry.episode;
  const code = season == null ? `E${number}` : `S${season}E${number}`;
  const name = title?.trim();
  return name ? `${code} · ${name}` : code;
}

/** Returns `undefined` for releases and seasonless non-AniList entries (e.g. Simkl anime, which uses absolute AniDB numbering). */
export function episodeHref(entry: UpNextEntry): string | undefined {
  if (entry.kind !== 'episode') return undefined;
  const { season, number } = entry.episode;
  if (season != null) return routes.episode(entry.item.id, season, number);
  if (entry.source === Provider.AniList) return routes.animeEpisode(entry.item.id, number);
  return undefined;
}
