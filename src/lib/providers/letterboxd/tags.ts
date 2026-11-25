import * as Effect from 'effect/Effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import { Provider } from '@/lib/providers/types';
import { LETTERBOXD_BASE_URL } from './config';
import type { LetterboxdDeps } from './deps';

/** One entry off the member's public tag index (`/{user}/tags/`). */
export interface LetterboxdTag {
  /** Display name as the user wrote it, entity-decoded, e.g. "criterion collection". */
  name: string;
  /** How many films carry it. Frequency order is the page's own default. */
  count: number;
}

/**
 * Minimal entity decoding for the handful Letterboxd emits in tag names and
 * `title` attributes. Deliberately a local copy of the same table `diary.ts`
 * and `watchlist.ts` carry: each scraper owns its decoder (they are private to
 * their module), and consolidating them into a shared helper means touching
 * both siblings — a separate change, not this one.
 */
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

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`${name}=(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return match == null ? null : (match[1] ?? match[2] ?? null);
}

/** Extract tags and counts from the public tags section, excluding unrelated tag links. */
export function parseTagsPage(html: string): LetterboxdTag[] {
  const section = /<ul\b[^>]*\bclass="[^"]*\bjs-tags-section\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/.exec(
    html,
  );
  if (section == null) return [];

  const rows = section[1].match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];

  const tags: LetterboxdTag[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const anchor = /<a\b[^>]*\bhref="\/[^/"]+\/tag\/[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(row);
    if (anchor == null) continue;

    const openTag = /<a\b[^>]*>/.exec(anchor[0])?.[0] ?? '';
    // `title` first (a single flat attribute); the link text is the fallback
    // for the day Letterboxd drops the attribute — strip any nested markup.
    const name = decodeEntities(
      attribute(openTag, 'title') ?? anchor[1].replaceAll(/<[^>]*>/g, ''),
    );
    if (name === '' || seen.has(name)) continue;

    // The count sits alone inside the detail span, wrapped in heavy \n\t
    // padding — `Number()` on the trimmed text, never a substring index.
    const detail = /<span\b[^>]*\bclass="[^"]*\bdetail\b[^"]*"[^>]*>([\s\S]*?)<\/span>/.exec(
      row,
    );
    const count = detail == null ? Number.NaN : Number(detail[1].trim());

    seen.add(name);
    // A count-less (or unparseable) row still contributes its name: the picker
    // needs the vocabulary, and the page's own order already encodes frequency.
    tags.push({ name, count: Number.isFinite(count) ? count : 0 });
  }
  return tags;
}

/** The member's public tag vocabulary, most-used first. */
export function getUserTags(
  deps: LetterboxdDeps,
): Effect.Effect<LetterboxdTag[], ProviderError> {
  const username = deps.username;
  if (username == null || username === '') {
    return Effect.fail(
      new ProviderAuthError({ provider: Provider.Letterboxd, refreshFailed: true }),
    );
  }

  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) => deps.fetch(`${LETTERBOXD_BASE_URL}/${username}/tags/`, { signal }),
      catch: (cause) => new ProviderNetworkError({ provider: Provider.Letterboxd, cause }),
    });

    if (response.status === 404) {
      return yield* new ProviderAuthError({
        provider: Provider.Letterboxd,
        refreshFailed: true,
      });
    }
    if (response.status === 429) {
      return yield* new ProviderRateLimitError({ provider: Provider.Letterboxd });
    }
    if (!response.ok) {
      return yield* new ProviderNetworkError({
        provider: Provider.Letterboxd,
        cause: new Error(`Letterboxd responded ${response.status} for /${username}/tags/`),
      });
    }

    const html = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () =>
        new ProviderDecodeError({
          provider: Provider.Letterboxd,
          detail: 'unreadable tags page body',
        }),
    });

    return parseTagsPage(html);
  });
}
