import type { UpNextEntry, UpNextRelease } from './types';

/**
 * The two reads shared across the `kind` union (KTD-1): when an entry happens,
 * and what its line says. Ordering, day bucketing and badging all ask the first
 * question — asking it through one accessor is what stops a release being
 * silently treated as instant-less by a call site still reaching for
 * `.episode.firstAired`.
 */

/**
 * When the entry happens, as the source stated it: an ISO instant for an
 * episode, a bare `YYYY-MM-DD` for a release. Deliberately *not* normalized to
 * an instant here — `lib/time` parses both, and flattening a date-only release
 * to local midnight would destroy the `isDateOnly` signal that suppresses a
 * bogus 00:00 time badge. Undefined when the source carried nothing (AniList
 * back-episodes), which every caller already treats as "no cell, no badge".
 */
export function entryInstant(entry: UpNextEntry): string | undefined {
  return entry.kind === 'episode'
    ? entry.episode.firstAired
    : entry.release.date;
}

/**
 * A release row names the release rather than a date the badge already carries;
 * "Streaming" is what `digital` means to a user reading a schedule.
 */
const RELEASE_LABELS: Record<UpNextRelease['kind'], string> = {
  digital: 'Streaming',
  physical: 'Physical release',
  theatrical: 'In theaters',
};

/** The card's second line: "S1E4 · Title" for episodes, the release otherwise. */
export function entryLabel(entry: UpNextEntry): string {
  if (entry.kind === 'release') return RELEASE_LABELS[entry.release.kind];
  // An AniList entry carries no canonical season (plan 0027), so it reads as
  // "E7" rather than a made-up "S1E7" — the entry itself *is* the season.
  const { season, number, title } = entry.episode;
  const code = season == null ? `E${number}` : `S${season}E${number}`;
  return title == null ? code : `${code} · ${title}`;
}
