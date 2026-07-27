import { entryLabel } from './entry';
import type { UpNextEntry } from './types';

/**
 * One card's worth of a Calendar day (owner decision 2026-07-27). A show that
 * drops its whole season at once produces one entry per episode, and the day
 * row renders ten near-identical cards — same artwork, same relative day, same
 * air time — whose only differing field is the smallest text on the card. Worse,
 * everything else airing that day is pushed off the right edge.
 *
 * Grouping is deliberately a **rendering** concern and lives here rather than in
 * `compute.ts`: `UpNextEntry` stays one-per-episode through dedupe, ordering,
 * the hidden-items filter and the day bucketing, and only the row that draws
 * cards collapses. Nothing downstream of a card has to learn about batches.
 */
export interface UpNextGroup {
  /**
   * Stable list key. The lead entry's id, which already carries its episode —
   * so a quick-log that advances the show re-keys the card exactly as before.
   */
  id: string;
  /** The entry the card renders from: the first of the batch in the day's order. */
  lead: UpNextEntry;
  /** Every entry this card stands for. Length 1 is an ordinary, ungrouped card. */
  entries: UpNextEntry[];
}

/**
 * What merges. Episodes of one show collapse; **releases never do** — a film's
 * theatrical and digital rows share an item id but say different things ("In
 * theaters" / "Streaming"), and collapsing them would hide the one fact the row
 * exists to carry (plan 0030 R3). Keying releases on their own entry id, which
 * already includes the release kind, keeps every one of them separate.
 */
function groupKey(entry: UpNextEntry): string {
  return entry.kind === 'episode'
    ? `episode:${entry.item.id}`
    : `release:${entry.id}`;
}

/**
 * The day's entries as cards. Callers pass entries already bucketed to one local
 * day (`calendarWeek`), so the day is implicit in the input and never re-derived
 * here — two airings of one show on *different* days are two cards, which is
 * what the week strip is for.
 *
 * Insertion-ordered: a `Map` preserves first-seen order, so groups appear where
 * their lead did and the row keeps the soonest-first ordering `computeUpNext`
 * established.
 */
export function groupDayEntries(
  entries: readonly UpNextEntry[],
): UpNextGroup[] {
  const groups = new Map<string, UpNextGroup>();
  for (const entry of entries) {
    const existing = groups.get(groupKey(entry));
    if (existing == null) {
      groups.set(groupKey(entry), { id: entry.id, lead: entry, entries: [entry] });
      continue;
    }
    existing.entries.push(entry);
  }
  return [...groups.values()];
}

/**
 * A one-entry group. Continue Watching is one entry per show by construction —
 * the pool fan answers with a single `next_episode` pointer each — so it wraps
 * rather than groups: running the grouper there would imply batches are possible
 * in a section that can't produce them.
 */
export function soloGroup(entry: UpNextEntry): UpNextGroup {
  return { id: entry.id, lead: entry, entries: [entry] };
}

/**
 * The season every entry in the batch belongs to, or undefined when they
 * disagree or when the source states none. AniList entries carry no canonical
 * season (plan 0027), so an anime batch has nothing to name and falls back to
 * the bare count rather than asserting a season it doesn't know.
 */
function sharedSeason(entries: readonly UpNextEntry[]): number | undefined {
  let shared: number | undefined;
  for (const entry of entries) {
    if (entry.kind !== 'episode') return undefined;
    const { season } = entry.episode;
    if (season == null) return undefined;
    if (shared == null) shared = season;
    else if (shared !== season) return undefined;
  }
  return shared;
}

/**
 * The card's second line. An ungrouped card is unchanged — `entryLabel`, the
 * episode code and title. A batch names the season and the count instead of a
 * range: "S2E1–E10" is only true when the numbers are consecutive, and a batch
 * that starts mid-season or skips a number is common enough (a provider that
 * lists specials, a partially-watched season) that the count is the field worth
 * trusting. The individual episodes are one tap away on the details screen.
 */
export function groupLabel(group: UpNextGroup): string {
  if (group.entries.length === 1) return entryLabel(group.lead);
  const count = `${group.entries.length} episodes`;
  const season = sharedSeason(group.entries);
  return season == null ? count : `Season ${season} · ${count}`;
}
