import { Effect, Schema } from 'effect';

import type { HttpFetch } from '@/lib/http/types';
import type { NormalizedMediaItem } from '@/types/media';

export type DiscussionBoard = 'a' | 'tv' | 'co';

const catalogSchema = Schema.Array(Schema.Struct({
  threads: Schema.Array(Schema.Struct({
    no: Schema.Int,
    sub: Schema.optional(Schema.String),
    com: Schema.optional(Schema.String),
    tim: Schema.optional(Schema.Int),
    spoiler: Schema.optional(Schema.Int),
    filedeleted: Schema.optional(Schema.Int),
  })),
}));

export function discussionBoards(item: NormalizedMediaItem): DiscussionBoard[] {
  const anime = item.type === 'ANIME' || item.externalIds.anilist != null || item.externalIds.mal != null;
  const movie = item.type === 'MOVIE' || item.isFilm === true;
  return anime ? movie ? ['a', 'tv', 'co'] : ['a'] : ['tv', 'co'];
}

export function discussionSearchUrl(board: DiscussionBoard, title: string) {
  return `https://boards.4chan.org/${board}/catalog#s=${encodeURIComponent(title)}`;
}

/** Plain searchable text only; remote HTML is never rendered. */
function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => {
    const point = code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : Number(code);
    return point <= 0x10ffff ? String.fromCodePoint(point) : ' ';
  }).replace(/&(?:amp|quot|apos|lt|gt|nbsp);/gi, (entity) => {
    switch (entity.toLowerCase()) {
      case '&amp;': return '&';
      case '&quot;': return '"';
      case '&apos;': return "'";
      default: return ' ';
    }
  });
}

function normalize(value: string): string {
  return plainText(value).normalize('NFKC').toLowerCase()
    .replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export const getDiscussionCatalog = Effect.fn('getDiscussionCatalog')(function*(
  fetch: HttpFetch,
  board: DiscussionBoard,
) {
  const body = yield* Effect.tryPromise({
    try: async (signal) => {
      const baseUrl = process.env.EXPO_OS === 'web' ? '/api/fourchan' : 'https://a.4cdn.org';
      const response = await fetch(`${baseUrl}/${board}/catalog.json`, { signal });
      if (!response.ok) throw new Error(`4chan catalog: ${response.status}`);
      return response.json();
    },
    catch: (cause) => new Error('Could not load discussion catalog', { cause }),
  });
  const pages = yield* Schema.decodeUnknownEffect(catalogSchema)(body);
  return pages.flatMap((page) => page.threads).map((thread) => ({
    id: thread.no,
    subject: plainText(thread.sub ?? ''),
    opening: plainText(thread.com ?? ''),
    image: thread.tim != null && thread.tim > 0 && thread.spoiler !== 1 && thread.filedeleted !== 1
      ? `https://i.4cdn.org/${board}/${thread.tim}s.jpg` : '',
  }));
});

/** Alias matches; inferred initials need discussion context in the subject to avoid incidental mentions. */
export function matchDiscussionThreads(
  catalog: { id: number; subject: string; opening: string; image?: string }[],
  item: NormalizedMediaItem,
  season?: number,
  number?: number,
) {
  const titles = [item.title, ...Object.values(item.titles ?? {}), ...(item.titleAliases ?? [])]
    .filter((title): title is string => title != null && title.trim() !== '')
    .map(normalize).filter((title) => title !== '');
  const initials = titles.map((title) => title.split(' ').map((word) => word[0]).join(''))
    .filter((alias) => /^[a-z]{3,6}$/.test(alias));
  const horror = item.genres?.some((genre) => normalize(genre) === 'horror') === true;
  return catalog.flatMap((thread) => {
    if (thread.id <= 0) return [];
    const text = ` ${normalize(`${thread.subject} ${thread.opening}`)} `;
    const markers = [...`${thread.subject} ${thread.opening}`.matchAll(/\bs(\d+)\s*e(\d+)\b|\b(?:episode|ep|e)\.?\s*#?\s*(\d+)\b/gi)];
    const subject = ` ${normalize(thread.subject)} `;
    const horrorGeneral = horror && /^(?:hsg\s+)?horror(?:\s+(?:and\s+)?supernatural)?(?:\s+(?:movies?|films?|shows?|tv))?\s+(?:general|discussion|thread)\b/.test(subject.trim());
    const abbreviated = initials.some((alias) => subject.includes(` ${alias} `) && (
      /\b(?:episode|ep|e)\.?\s*#?\s*\d+\b|\bs\d+\s*e\d+\b|\b(?:discussion|general|thread)\b/i.test(thread.subject) ||
      thread.subject.toLowerCase().includes(`/${alias}/`)
    ));
    if (!titles.some((title) => text.includes(` ${title} `)) && !abbreviated && !horrorGeneral) return [];
    if (!horrorGeneral && number != null && markers.length > 0 && !markers.some((marker) =>
      marker[3] != null ? Number(marker[3]) === number
        : Number(marker[1]) === season && Number(marker[2]) === number,
    )) return [];
    return [{
      id: thread.id,
      title: thread.subject.trim() || item.title,
      image: thread.image ?? '',
      episodeSpecific: !horrorGeneral && number != null && markers.length > 0,
    }];
  }).sort((a, b) => b.id - a.id);
}
