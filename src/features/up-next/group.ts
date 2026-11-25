import { entryLabel } from './entry';
import type { UpNextEntry } from './types';

export interface UpNextGroup {
  id: string;
  lead: UpNextEntry;
  entries: UpNextEntry[];
}

function groupKey(entry: UpNextEntry): string {
  return entry.kind === 'episode'
    ? `episode:${entry.item.id}`
    : `release:${entry.id}`;
}

export function groupDayEntries(
  entries: readonly UpNextEntry[],
): UpNextGroup[] {
  const groups = new Map<string, UpNextGroup>();
  for (const entry of entries) {
    const key = groupKey(entry);
    const existing = groups.get(key);
    if (existing == null) {
      groups.set(key, { id: key, lead: entry, entries: [entry] });
      continue;
    }
    existing.entries.push(entry);
  }
  return [...groups.values()];
}

export function soloGroup(entry: UpNextEntry): UpNextGroup {
  return { id: groupKey(entry), lead: entry, entries: [entry] };
}

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

export function groupLabel(group: UpNextGroup): string {
  if (group.entries.length === 1) return entryLabel(group.lead);
  const count = `${group.entries.length} episodes`;
  const season = sharedSeason(group.entries);
  return season == null ? count : `Season ${season} · ${count}`;
}
