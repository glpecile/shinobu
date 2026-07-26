import { useSyncExternalStore } from 'react';

import { isServer, prefsStorage } from './storage';

/**
 * Tags the user actually applied on recent logs, most-recent-first. The local
 * half of the log sheet's two-source suggestion list: Letterboxd's own tag
 * index (`useLetterboxdTagsQuery`) is the remote vocabulary, this is the
 * offline-available, zero-latency one — it also covers a tag the user invented
 * seconds ago, which the remote page won't list until it is re-scraped.
 *
 * Stored as one JSON array under a single key (not one key per tag, unlike
 * `hidden-items.ts`) because order is the whole point and a key scan has none.
 */
const KEY = 'recentTags';

/** Enough to fill a chip row several times over; bounded so the value stays tiny. */
const MAX_RECENT_TAGS = 30;

/** Shared identity so an empty result never changes reference between renders. */
const EMPTY: string[] = [];

let cachedRecent: string[] | null = null;

function read(): string[] {
  if (isServer()) return [];
  const raw = prefsStorage.getString(KEY);
  if (raw == null || raw === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    // A corrupt value is a cosmetic preference, not state worth recovering.
    return [];
  }
}

/**
 * Merge `tags` in at the front, most-recent-first. Deduped **case-insensitively**
 * (Letterboxd folds tag case, so "Rewatch" and "rewatch" are one tag) while
 * storing the casing the user just typed, then capped. Pure and exported so the
 * ordering contract is testable without the store.
 */
export function mergeRecentTags(
  existing: readonly string[],
  tags: readonly string[],
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const tag of [...tags, ...existing]) {
    const name = tag.trim();
    if (name === '') continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(name);
    if (merged.length === MAX_RECENT_TAGS) break;
  }
  return merged;
}

/** Record the tags a just-succeeded log carried. A no-op for an empty list. */
export function recordRecentTags(tags: string[]): void {
  if (tags.length === 0 || isServer()) return;
  const next = mergeRecentTags(read(), tags);
  if (next.length === 0) return;
  prefsStorage.set(KEY, JSON.stringify(next));
  // Keep the hook's snapshot honest even where no change listener fires.
  cachedRecent = next;
}

/** The recent tags, most-recent-first — the imperative read. */
export function getRecentTags(): string[] {
  return read();
}

function getSnapshot(): string[] {
  // Same snapshot-caching + SSR-lazy contract as hidden-items.ts:
  // useSyncExternalStore compares by reference, and MMKV/localStorage must not
  // be touched during server rendering.
  if (cachedRecent == null && !isServer()) {
    cachedRecent = read();
  }
  return cachedRecent ?? EMPTY;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener((changedKey) => {
    if (changedKey !== KEY) return;
    cachedRecent = read();
    onStoreChange();
  });
  return () => subscription.remove();
}

/** The recent tags, most-recent-first — reactive, for the tag picker. */
export function useRecentTags(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
