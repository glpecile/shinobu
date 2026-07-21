import { Effect } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import type { NormalizedDiaryEntry } from '@/types/media';
import { LETTERBOXD_BASE_URL } from './config';
import type { LetterboxdDeps } from './deps';

/**
 * One diary `<item>` scraped off the public RSS feed. The RSS window is the
 * whole Letterboxd diary source (plan 0016 U3): deeper history via the HTML
 * diary pages is Cloudflare-walled beyond page 1
 * (docs/solutions/letterboxd-diary-html-cloudflare-walled.md), and RSS carries
 * real TMDB ids the HTML rows lack anyway.
 */
export interface LetterboxdDiaryItem {
  /** RSS guid (`letterboxd-watch-{n}` / `letterboxd-review-{n}`) — the log id. */
  guid: string;
  /** Film URL slug — Shinobu's Letterboxd external id. */
  slug: string;
  title: string;
  year?: number;
  /** Bare `YYYY-MM-DD` diary date (no time — see plan 0016 KTD4). */
  watchedDate: string;
  /** `letterboxd:rewatch` = Yes. */
  rewatch: boolean;
  /** `tmdb:movieId` — the cross-provider identity that lets a fanned-out log collapse. */
  tmdbId?: number;
  /** Poster URL lifted from the entry's CDATA `<img>`; '' when absent. */
  posterUrl?: string;
}

/** Minimal entity decoding for the handful RSS emits in text nodes. */
function decodeEntities(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .trim();
}

/** Value of `<name>…</name>` (namespaced names' `:` is matched literally). */
function tagText(block: string, name: string): string | null {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(block);
  if (match == null) return null;
  // Strip a CDATA wrapper if present, then decode entities.
  const raw = match[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1');
  return decodeEntities(raw);
}

/**
 * Parses the diary RSS feed into raw items. Pure for fixture testing. The
 * `<title>`/`<link>` fall through per Letterboxd's namespaced fields
 * (`letterboxd:filmTitle`, the `/film/{slug}/` link); an item missing both a
 * slug and a title is skipped rather than emitting a junk row.
 */
export function parseDiaryFeed(xml: string): LetterboxdDiaryItem[] {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  const items: LetterboxdDiaryItem[] = [];
  for (const block of blocks) {
    const guid = tagText(block, 'guid');
    const link = tagText(block, 'link');
    const slug = link != null ? /\/film\/([^/]+)\//.exec(link)?.[1] : null;
    const title = tagText(block, 'letterboxd:filmTitle');
    const watchedDate = tagText(block, 'letterboxd:watchedDate');
    if (guid == null || slug == null || title == null || watchedDate == null) {
      continue;
    }

    const yearText = tagText(block, 'letterboxd:filmYear');
    const year = yearText != null ? Number(yearText) : NaN;
    const tmdbText = tagText(block, 'tmdb:movieId');
    const tmdbId = tmdbText != null ? Number(tmdbText) : NaN;
    const description = tagText(block, 'description') ?? '';
    const posterUrl = /<img[^>]*\bsrc="([^"]+)"/.exec(description)?.[1];

    items.push({
      guid,
      slug,
      title,
      ...(Number.isFinite(year) ? { year } : {}),
      watchedDate,
      rewatch: tagText(block, 'letterboxd:rewatch')?.toLowerCase() === 'yes',
      ...(Number.isFinite(tmdbId) ? { tmdbId } : {}),
      ...(posterUrl != null ? { posterUrl } : {}),
    });
  }
  return items;
}

/**
 * One diary RSS item → a diary entry. Movies carry no episode detail. The entry
 * is date-only (`dateOnly: true`, `watchedAt` the bare diary date) so grouping
 * parses it as local midnight and orders it after instant entries the same day
 * (plan 0016 KTD4). `fetchedAt` is injected so the embedded item's
 * `lastUpdated` (a true instant per the contract) stays deterministic in tests.
 */
export function normalizeDiaryItem(
  raw: LetterboxdDiaryItem,
  fetchedAt: string,
): NormalizedDiaryEntry {
  return {
    id: `letterboxd-${raw.guid}`,
    provider: 'letterboxd',
    watchedAt: raw.watchedDate,
    dateOnly: true,
    item: {
      id: `letterboxd-${raw.slug}`,
      title: raw.title,
      coverImage: raw.posterUrl ?? '',
      ...(raw.year != null ? { year: raw.year } : {}),
      type: 'MOVIE',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: fetchedAt,
      externalIds: {
        letterboxd: raw.slug,
        ...(raw.tmdbId != null ? { tmdb: raw.tmdbId } : {}),
      },
    },
  };
}

/**
 * The user's public diary from the RSS feed (plan 0016 U3). Only page 1 has
 * data — RSS is a single recent window and deeper HTML pages are Cloudflare-
 * walled (docs/solutions/letterboxd-diary-html-cloudflare-walled.md) — so later
 * pages return `[]` (exhaustion), dropping Letterboxd out of the watermark merge
 * early. A 404 (or a non-feed body) is a private/renamed/deleted profile: a
 * tagged provider error surfaced under the diary's failure banner, never a
 * silent empty diary. Native-only on web (no CORS) — gated in the query layer.
 */
export function getDiary(
  deps: LetterboxdDeps,
  params: { page: number },
): Effect.Effect<NormalizedDiaryEntry[], ProviderError> {
  const username = deps.username;
  if (username == null || username === '') {
    return Effect.fail(
      new ProviderAuthError({ provider: 'letterboxd', refreshFailed: true }),
    );
  }
  if (params.page > 1) return Effect.succeed([]);

  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => deps.fetch(`${LETTERBOXD_BASE_URL}/${username}/rss/`),
      catch: (cause) => new ProviderNetworkError({ provider: 'letterboxd', cause }),
    });

    if (response.status === 404) {
      return yield* new ProviderAuthError({
        provider: 'letterboxd',
        refreshFailed: true,
      });
    }
    if (response.status === 429) {
      return yield* new ProviderRateLimitError({ provider: 'letterboxd' });
    }
    if (!response.ok) {
      return yield* new ProviderNetworkError({
        provider: 'letterboxd',
        cause: new Error(`Letterboxd responded ${response.status} for /${username}/rss/`),
      });
    }

    const xml = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () =>
        new ProviderDecodeError({
          provider: 'letterboxd',
          detail: 'unreadable diary RSS body',
        }),
    });

    // A private/absent profile serves an HTML error page, not a feed — treat
    // the absence of a feed as a tagged error, never a silent empty diary.
    if (!xml.includes('<rss') && !xml.includes('<channel')) {
      return yield* new ProviderDecodeError({
        provider: 'letterboxd',
        detail: 'diary RSS feed absent (private or nonexistent profile)',
      });
    }

    const fetchedAt = new Date().toISOString();
    return parseDiaryFeed(xml).map((item) => normalizeDiaryItem(item, fetchedAt));
  });
}
