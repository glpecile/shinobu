/**
 * The Hardcover → AniList reading bridge (plan 0117 B5). Hardcover tracks a
 * manga or light novel as one book per volume, and AniList as one series
 * entry. Nothing publishes a mapping, so a book matches an AniList entry only
 * when a title and a staff member agree. Anything less is no match, because a
 * wrong match writes to the wrong entry on a real list.
 *
 * The title shapes come from Hardcover's catalogue (probed 2026-11-18):
 * "One Piece, Vol. 1: Romance Dawn", "NISEMONOGATARI, Part 1: Fake Tale
 * (Light Novel)", "NISEMONOGATARI: Fake Tale, Part 2", "Mushoku Tensei: …
 * (Light Novel) Vol. 8" and "Berserk Deluxe Edition Volume 1".
 */

import type { NormalizedMediaItem } from '@/types/media';

/** A Hardcover book, as the bridge reads it. */
export interface BridgeBook {
  title: string;
  /** Every credited person, translators included. */
  authors: readonly string[];
  series?: { name: string };
}

/** An AniList `MANGA` search result, as the bridge reads it. */
export interface BridgeCandidate {
  id: number;
  /** AniList's format: `MANGA`, `NOVEL`, `ONE_SHOT`. */
  format: string | null;
  /** Null while AniList doesn't know the count. */
  volumes: number | null;
  /** Romaji, English, native and synonyms. */
  titles: readonly string[];
  /** Each staff member's full, native and alternative names. */
  staff: readonly string[];
}

export interface BridgeMatch {
  anilistId: number;
  /** The AniList volume this book is, or null when the book doesn't say. */
  volume: number | null;
}

const FORMAT_TAG = /\s*\((light novels?|novel|manga)\)/gi;
const VOLUME_MARKER = /(?:,\s*|\s+)(?:vol\.?|volume)\s*(\d+)\b/i;
// "Part 3--Stardust Crusaders, Vol. 1" is volume 1 of Part 3, so Vol wins.
// Only ", Part N" numbers a book; "Adventure Part 3: …" names an arc.
const PART_MARKER = /,\s*part\s*(\d+)\b/i;
// An omnibus or a special edition numbers its own volumes, which aren't AniList's.
const EDITION = /\b(edition|omnibus|kanzenban|box set|\d+\s*-?\s*in\s*-?\s*\d+)\b/i;

interface ParsedTitle {
  /** The work's names: the title before its marker, and that before its subtitle. */
  names: string[];
  volume: number | null;
  format: 'novel' | 'manga' | null;
  edition: boolean;
}

export function parseBookTitle(title: string): ParsedTitle {
  const tag = [...title.matchAll(FORMAT_TAG)][0]?.[1];
  const rest = title.replace(FORMAT_TAG, ' ').replace(/\s+/g, ' ').trim();
  const marker = VOLUME_MARKER.exec(rest) ?? PART_MARKER.exec(rest);
  const base = (marker == null ? rest : rest.slice(0, marker.index)).trim();
  // ": " only, so "Re:ZERO" keeps its name.
  const names = [base, base.split(': ')[0].trim()].filter((name, index, all) => name !== '' && all.indexOf(name) === index);
  return {
    names,
    volume: marker == null ? null : Number(marker[1]),
    format: tag == null ? null : /manga/i.test(tag) ? 'manga' : 'novel',
    edition: EDITION.test(title),
  };
}

/** Case, accents, punctuation and long vowels ("Eiichirou", "Eiichiro") folded away. */
function foldWords(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ou/g, 'o')
    .replace(/uu/g, 'u')
    .replace(/oo/g, 'o')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

function titleKey(text: string): string {
  return foldWords(text).join('');
}

/** Both orders of a name: "Ishin Nishio" is "Nishio Ishin", and "Nisio Isin" is "NISIOISIN". */
function nameKeys(text: string): string[] {
  const words = foldWords(text);
  return [words.join(''), [...words].sort().join('')];
}

/**
 * What to search AniList for: the work's names, then the series name. Only a
 * title with a volume marker or a format tag reads as a manga or light novel
 * volume, so any other book costs no AniList request.
 */
export function bridgeQueries(book: BridgeBook): string[] {
  const parsed = parseBookTitle(book.title);
  if (parsed.volume == null && parsed.format == null) return [];
  const series = book.series?.name.replace(FORMAT_TAG, '').trim();
  const queries = series == null || series === '' ? parsed.names : [...parsed.names, series];
  return queries.filter((query, index) => queries.findIndex((other) => titleKey(other) === titleKey(query)) === index);
}

/**
 * The AniList entry `book` is a volume of, from every result its
 * `bridgeQueries` returned. One entry must match both a title and a staff
 * member, in the format the book's tag names; two that do are no match.
 */
export function pickBridgeMatch(book: BridgeBook, results: readonly BridgeCandidate[]): BridgeMatch | null {
  return matchFolded(book, results.map(foldCandidate));
}

/** A candidate's names folded once, so a list of books compares without refolding them. */
interface FoldedCandidate {
  candidate: BridgeCandidate;
  titles: string[];
  staff: Set<string>;
}

function foldCandidate(candidate: BridgeCandidate): FoldedCandidate {
  return { candidate, titles: candidate.titles.map(titleKey), staff: new Set(candidate.staff.flatMap(nameKeys)) };
}

function matchFolded(book: BridgeBook, folded: readonly FoldedCandidate[]): BridgeMatch | null {
  const parsed = parseBookTitle(book.title);
  const titleNames = new Set(parsed.names.map(titleKey));
  const seriesName = book.series == null ? null : titleKey(book.series.name.replace(FORMAT_TAG, ''));
  const authors = book.authors.flatMap(nameKeys);

  const matches = new Map<number, { candidate: BridgeCandidate; viaTitle: boolean }>();
  for (const { candidate, titles, staff } of folded) {
    if (parsed.format === 'novel' && candidate.format !== 'NOVEL') continue;
    if (parsed.format === 'manga' && candidate.format === 'NOVEL') continue;
    if (!authors.some((key) => staff.has(key))) continue;
    const viaTitle = titles.some((key) => titleNames.has(key));
    if (viaTitle || (seriesName != null && titles.includes(seriesName))) matches.set(candidate.id, { candidate, viaTitle });
  }
  if (matches.size !== 1) return null;

  const [{ candidate, viaTitle }] = matches.values();
  // A match by series name alone can't say which volume: a spin-off or a
  // franchise numbers its own books.
  const volume = viaTitle && !parsed.edition ? (parsed.volume ?? (candidate.volumes === 1 ? 1 : null)) : null;
  // A number past the entry's known count, or a volume 0, names some other numbering.
  const known = volume != null && volume >= 1 && (candidate.volumes == null || volume <= candidate.volumes);
  return { anilistId: candidate.id, volume: known ? volume : null };
}

function bookOf(item: NormalizedMediaItem): BridgeBook | null {
  const credits = item.readingCredits;
  if (item.type !== 'BOOK' || credits == null) return null;
  return { title: item.title, authors: credits.people, ...(credits.series != null ? { series: { name: credits.series } } : {}) };
}

function candidateOf(item: NormalizedMediaItem): BridgeCandidate | null {
  const id = item.externalIds.anilist;
  const credits = item.readingCredits;
  if (item.type !== 'MANGA' || id == null || credits == null) return null;
  return {
    id,
    format: credits.format ?? null,
    volumes: credits.volumes ?? null,
    titles: [item.title, ...Object.values(item.titles ?? {}), ...(item.titleAliases ?? [])],
    staff: credits.people,
  };
}

// Folding runs NFKD and regexes, which Hermes runs slowly. A cached list
// keeps its items' identity, so each item folds once per fetch.
const foldedEntries = new WeakMap<NormalizedMediaItem, FoldedCandidate | null>();
const parsedBooks = new WeakMap<NormalizedMediaItem, BridgeBook | null>();

/** A book's facts, or null when its title reads as no manga or light novel volume (B5's gate). */
function parsedBookOf(item: NormalizedMediaItem): BridgeBook | null {
  let book = parsedBooks.get(item);
  if (book === undefined) {
    book = bookOf(item);
    if (book != null && bridgeQueries(book).length === 0) book = null;
    parsedBooks.set(item, book);
  }
  return book;
}

function foldedOf(entry: NormalizedMediaItem): FoldedCandidate | null {
  let folded = foldedEntries.get(entry);
  if (folded === undefined) {
    const candidate = candidateOf(entry);
    folded = candidate == null ? null : foldCandidate(candidate);
    foldedEntries.set(entry, folded);
  }
  return folded;
}

/**
 * Each Hardcover book in `books` that is a volume of an AniList entry in
 * `entries` (plan 0117 B6), keyed by the book's item id and carrying that
 * entry as `bridgedAniList`. It compares only what the two lists loaded, so
 * it costs no request, and it groups cards only: no write reads it.
 */
export function bridgeBooks(
  books: readonly NormalizedMediaItem[],
  entries: readonly NormalizedMediaItem[],
): Map<string, NormalizedMediaItem> {
  const folded = entries.flatMap((entry) => foldedOf(entry) ?? []);
  const bridged = new Map<string, NormalizedMediaItem>();
  if (folded.length === 0) return bridged;
  for (const item of books) {
    const book = parsedBookOf(item);
    const match = book == null ? null : matchFolded(book, folded);
    const entry = match == null ? undefined : folded.find(({ candidate }) => candidate.id === match.anilistId);
    if (match == null || entry == null) continue;
    bridged.set(item.id, { ...item, bridgedAniList: { id: match.anilistId, title: entry.candidate.titles[0] } });
  }
  return bridged;
}

/**
 * One card per bridged work (plan 0117 B6): the Hardcover volume, which holds
 * the finer progress, carries its `bridgedAniList`, and the entry it covers drops
 * out of `items`. `entries` is the whole AniList list, so a book matches the
 * same entry on every screen. The card keeps the newer of the two updates,
 * so a stale volume doesn't bury a work read today.
 */
export function showBridgedOnce(
  items: readonly NormalizedMediaItem[],
  entries: readonly NormalizedMediaItem[],
): NormalizedMediaItem[] {
  const bridged = bridgeBooks(items, entries);
  if (bridged.size === 0) return [...items];
  const covering = new Map([...bridged.values()].map((book) => [book.bridgedAniList?.id, book]));
  const latest = new Map<number, string>();
  for (const item of items) {
    const id = item.externalIds.anilist;
    if (item.type === 'MANGA' && id != null && covering.has(id)) latest.set(id, item.lastUpdated);
  }
  return items.flatMap((item) => {
    if (item.type === 'MANGA' && covering.has(item.externalIds.anilist)) return [];
    const book = bridged.get(item.id);
    if (book == null) return [item];
    const entryUpdate = book.bridgedAniList == null ? undefined : latest.get(book.bridgedAniList.id);
    return [entryUpdate != null && entryUpdate > book.lastUpdated ? { ...book, lastUpdated: entryUpdate } : book];
  });
}
