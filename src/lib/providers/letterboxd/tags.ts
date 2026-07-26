import { Effect } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
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

/**
 * Parses the public tag index. The page renders one `<ul class="js-tags-section
 * tags tags-columns">` whose `<li>`s each hold a `/{user}/tag/{slug}/films/`
 * link (the display name lives in BOTH its `title` attribute and its text — the
 * attribute is the reliable one, the text can carry nested markup) and a
 * whitespace-padded `<span class="detail -has-count">` count. Letterboxd serves
 * the list already sorted by frequency descending, so the emitted order IS the
 * suggestion order — nothing here re-sorts.
 *
 * Pure for fixture testing, and total: a missing section, a shrunken attribute
 * set, or an unrelated page all yield `[]`. A missing suggestion list must
 * degrade to no chips, never to a broken sheet.
 */
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

/**
 * The member's public tag vocabulary, most-used first — the log sheet's
 * suggestion source. Built exactly like `getWatchlist`'s URL so the web
 * transport's proxy rewrite (`state/queries/letterboxd.ts`) applies unchanged;
 * the Worker's third allowlist rule covers this path (plan 0018 contract
 * unchanged — see `worker/letterboxd-proxy.ts`).
 *
 * Spiked 2026-07-25: unlike the deeper diary pages
 * (docs/solutions/letterboxd-diary-html-cloudflare-walled.md) this page answers
 * 200 to a plain client. A 404 is a renamed/deleted account (dead session);
 * anything else parseable-but-empty is just "no tags yet".
 */
export function getUserTags(
  deps: LetterboxdDeps,
): Effect.Effect<LetterboxdTag[], ProviderError> {
  const username = deps.username;
  if (username == null || username === '') {
    return Effect.fail(
      new ProviderAuthError({ provider: 'letterboxd', refreshFailed: true }),
    );
  }

  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => deps.fetch(`${LETTERBOXD_BASE_URL}/${username}/tags/`),
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
        cause: new Error(`Letterboxd responded ${response.status} for /${username}/tags/`),
      });
    }

    const html = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () =>
        new ProviderDecodeError({
          provider: 'letterboxd',
          detail: 'unreadable tags page body',
        }),
    });

    return parseTagsPage(html);
  });
}
