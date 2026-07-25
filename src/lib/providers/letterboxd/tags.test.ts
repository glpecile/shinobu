import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { LetterboxdDeps } from './deps';
import { getUserTags, parseTagsPage } from './tags';

// Verbatim markup captured from a real `/{user}/tags/` page on 2026-07-25
// (davidehrlich) — including the heavy \n\t padding around each count, which is
// exactly what makes a substring-index parse fragile.
const REAL_PAGE = `<html><body>
<ul class="js-tags-section tags tags-columns" data-edit-modal-action="/ajax/tag/edit/" data-tag-context="film">
    <li class="hoverable" >
        <a href="/davidehrlich/tag/criterion-collection/films/" title="criterion collection">criterion collection</a>
        <span class="detail -has-count">
            11
        </span>
    </li>
    <li class="hoverable" >
        <a href="/davidehrlich/tag/nyff13/films/" title="nyff13">nyff13</a>
        <span class="detail -has-count">
            9
        </span>
    </li>
    <li class="hoverable" >
        <a href="/davidehrlich/tag/bill&#039;s &amp; ted&#039;s/films/" title="bill&#039;s &amp; ted&#039;s">bill&#039;s &amp; ted&#039;s</a>
        <span class="detail -has-count">
            2
        </span>
    </li>
    <li class="hoverable" >
        <a href="/davidehrlich/tag/no-count/films/" title="no count">no count</a>
    </li>
</ul>
</body></html>`;

describe('parseTagsPage', () => {
  test('extracts every tag with its count, in the page order (frequency desc)', () => {
    expect(parseTagsPage(REAL_PAGE)).toEqual([
      { name: 'criterion collection', count: 11 },
      { name: 'nyff13', count: 9 },
      { name: "bill's & ted's", count: 2 },
      { name: 'no count', count: 0 },
    ]);
  });

  test('keeps multi-word tag names intact', () => {
    expect(parseTagsPage(REAL_PAGE)[0].name).toBe('criterion collection');
  });

  test('decodes HTML entities in the display name', () => {
    expect(parseTagsPage(REAL_PAGE)[2].name).toBe("bill's & ted's");
  });

  test('a count-less <li> still contributes its name (count 0)', () => {
    expect(parseTagsPage(REAL_PAGE)[3]).toEqual({ name: 'no count', count: 0 });
  });

  test('falls back to the link text when the title attribute is gone', () => {
    const html = `<ul class="js-tags-section tags tags-columns">
      <li><a href="/gian/tag/rewatch/films/">re<em>watch</em></a><span class="detail -has-count">4</span></li>
    </ul>`;
    expect(parseTagsPage(html)).toEqual([{ name: 'rewatch', count: 4 }]);
  });

  test('an empty tag section yields []', () => {
    expect(
      parseTagsPage('<html><ul class="js-tags-section tags tags-columns"></ul></html>'),
    ).toEqual([]);
  });

  test('completely unrelated HTML yields [] rather than throwing', () => {
    expect(parseTagsPage('<html><body><p>nothing here</p></body></html>')).toEqual([]);
    expect(parseTagsPage('')).toEqual([]);
    // A tag *link* outside the section is not a tag entry.
    expect(
      parseTagsPage('<ul class="films"><li><a href="/gian/tag/x/films/">x</a></li></ul>'),
    ).toEqual([]);
  });

  test('skips list rows that are not tag links, and de-dupes repeats', () => {
    const html = `<ul class="js-tags-section tags">
      <li><span class="detail -has-count">3</span></li>
      <li><a href="/gian/films/">not a tag</a></li>
      <li><a href="/gian/tag/dupe/films/" title="dupe">dupe</a><span class="detail">5</span></li>
      <li><a href="/gian/tag/dupe/films/" title="dupe">dupe</a><span class="detail">5</span></li>
    </ul>`;
    expect(parseTagsPage(html)).toEqual([{ name: 'dupe', count: 5 }]);
  });
});

/** Records the requested URL so path construction is assertable. */
function recordingDeps(
  response: () => Response,
  urls: string[],
  username: string | null = 'gian',
): LetterboxdDeps {
  return {
    username,
    fetch: async (input) => {
      urls.push(String(input));
      return response();
    },
  };
}

describe('getUserTags', () => {
  test('reads /{username}/tags/ and returns the parsed vocabulary', async () => {
    const urls: string[] = [];
    const tags = await Effect.runPromise(
      getUserTags(recordingDeps(() => new Response(REAL_PAGE), urls, 'davidehrlich')),
    );
    expect(urls[0]).toBe('https://letterboxd.com/davidehrlich/tags/');
    expect(tags).toHaveLength(4);
    expect(tags[0]).toEqual({ name: 'criterion collection', count: 11 });
  });

  test('a member with no tags yields [] rather than an error', async () => {
    const tags = await Effect.runPromise(
      getUserTags(recordingDeps(() => new Response('<html></html>'), [])),
    );
    expect(tags).toEqual([]);
  });

  test('fails with a dead-session auth error when no username is connected', async () => {
    const outcome = await Effect.runPromise(
      Effect.flip(getUserTags(recordingDeps(() => new Response(''), [], null))),
    );
    expect(outcome._tag).toBe('ProviderAuthError');
  });

  test('maps a 404 (renamed/deleted account) to a dead-session auth error', async () => {
    const outcome = await Effect.runPromise(
      Effect.flip(
        getUserTags(recordingDeps(() => new Response('', { status: 404 }), [])),
      ),
    );
    expect(outcome._tag).toBe('ProviderAuthError');
  });

  test('maps a 429 to the rate-limit error', async () => {
    const outcome = await Effect.runPromise(
      Effect.flip(
        getUserTags(recordingDeps(() => new Response('', { status: 429 }), [])),
      ),
    );
    expect(outcome._tag).toBe('ProviderRateLimitError');
  });

  test('surfaces a failing page as a tagged network error', async () => {
    const outcome = await Effect.runPromise(
      Effect.flip(
        getUserTags(recordingDeps(() => new Response('', { status: 500 }), [])),
      ),
    );
    expect(outcome._tag).toBe('ProviderNetworkError');
  });
});
