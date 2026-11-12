import { describe, expect, mock, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import type { NormalizedMediaItem } from '@/types/media';
import type { HardcoverDeps } from './deps';

// The transport reaches the PKCE flow store, which is MMKV.
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({ getString: () => undefined, set: () => {}, remove: () => {} }),
}));

const { addToHardcoverReadingList, logToHardcover, removeFromHardcoverReadingList } =
  await import('./writes');

const BOOK: NormalizedMediaItem = {
  id: 'hardcover-427578',
  title: 'No Longer Human',
  coverImage: '',
  type: 'BOOK',
  currentProgress: 0,
  progressUnit: 'page',
  lastUpdated: '',
  externalIds: { hardcover: 427578 },
};

interface Read {
  id: number;
  finished_at: string | null;
  progress_pages: number | null;
}
interface Entry {
  id: number;
  status_id: number;
  rating?: number | null;
  user_book_reads: Read[];
}
interface Mutation {
  name: string;
  variables: Record<string, unknown>;
}

/**
 * A one-book Hardcover library. Reads answer from `entry`. A status change to
 * Currently Reading opens a read, as the server does. Mutations are recorded.
 */
function library(initial: Entry | null, options: { mutationError?: string; readFails?: boolean } = {}) {
  let entry = initial;
  const mutations: Mutation[] = [];
  const deps: HardcoverDeps = {
    clientId: 'cid',
    refreshLock: (run) => run(),
    tokens: { get: () => ({ accessToken: 'at' }), set: () => {}, clear: () => {} },
    fetch: async (_input, init) => {
      const { query, variables } = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      };
      if (query.startsWith('query BookEntry')) {
        if (options.readFails === true) return new Response('', { status: 500 });
        return Response.json({ data: { me: [{ user_books: entry == null ? [] : [entry] }] } });
      }
      const name = /^mutation \w+[^{]*\{\s*(\w+)/.exec(query)?.[1] ?? '';
      mutations.push({ name, variables });
      if (options.mutationError != null) {
        return Response.json({ data: { [name]: { error: options.mutationError, id: null } } });
      }
      const object = (variables.object ?? {}) as { status_id?: number };
      if (name === 'insert_user_book' || name === 'update_user_book') {
        entry = {
          id: entry?.id ?? 900,
          status_id: object.status_id ?? entry?.status_id ?? 1,
          user_book_reads:
            object.status_id === 2
              ? [{ id: 77, finished_at: null, progress_pages: null }, ...(entry?.user_book_reads ?? [])]
              : (entry?.user_book_reads ?? []),
        };
      }
      return Response.json({ data: { [name]: { id: 900 } } });
    },
  };
  return { deps, mutations };
}

const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(Effect.result(effect));
const PAST = { date: '2024-03-09', at: '2024-03-10T01:30:00.000Z' };

describe('logToHardcover — finished', () => {
  test('a book that is not in the library is created as Read on the chosen day, in one mutation', async () => {
    const { deps, mutations } = library(null);

    const result = await run(logToHardcover(deps, BOOK, { reading: { finished: true }, ...PAST }));

    expect(result).toMatchObject({ _tag: 'Success', success: { status: 'ok' } });
    expect(mutations).toEqual([
      {
        name: 'insert_user_book',
        variables: {
          object: { book_id: 427578, status_id: 3, user_date: '2024-03-09', action_at: PAST.at },
        },
      },
    ]);
  });

  test('a book in progress is set to Read on its own library entry', async () => {
    const { deps, mutations } = library({
      id: 456,
      status_id: 2,
      user_book_reads: [{ id: 12, finished_at: null, progress_pages: 140 }],
    });

    await run(logToHardcover(deps, BOOK, { reading: { finished: true }, date: '2026-11-12' }));

    expect(mutations).toEqual([
      { name: 'update_user_book', variables: { id: 456, object: { status_id: 3, user_date: '2026-11-12' } } },
    ]);
  });

  test('a Read book takes a second read only as a reread', async () => {
    const read: Entry = {
      id: 456,
      status_id: 3,
      user_book_reads: [{ id: 12, finished_at: '2020-01-01', progress_pages: 300 }],
    };
    const repeated = library(read);
    const reread = library(read);

    const skipped = await run(logToHardcover(repeated.deps, BOOK, { reading: { finished: true }, ...PAST }));
    await run(logToHardcover(reread.deps, BOOK, { reading: { finished: true }, ...PAST, reread: true }));

    expect(skipped).toMatchObject({ success: { status: 'skipped' } });
    expect(repeated.mutations).toEqual([]);
    expect(reread.mutations).toEqual([
      {
        name: 'insert_user_book_read',
        variables: { userBookId: 456, read: { finished_at: '2024-03-09', action_at: PAST.at } },
      },
    ]);
  });
});

describe('logToHardcover — page reached', () => {
  test('a book that is not in the library starts a read, then takes the page on that read', async () => {
    const { deps, mutations } = library(null);

    await run(logToHardcover(deps, BOOK, { reading: { finished: false, page: 42 }, ...PAST }));

    expect(mutations).toEqual([
      {
        name: 'insert_user_book',
        variables: {
          object: { book_id: 427578, status_id: 2, user_date: '2024-03-09', action_at: PAST.at },
        },
      },
      {
        name: 'update_user_book_read',
        variables: { id: 77, object: { progress_pages: 42, action_at: PAST.at } },
      },
    ]);
  });

  test('a read in progress takes the page with no status change', async () => {
    const { deps, mutations } = library({
      id: 456,
      status_id: 2,
      user_book_reads: [{ id: 12, finished_at: null, progress_pages: 140 }],
    });

    await run(logToHardcover(deps, BOOK, { reading: { finished: false, page: 142 }, date: '2026-11-12' }));

    expect(mutations).toEqual([
      { name: 'update_user_book_read', variables: { id: 12, object: { progress_pages: 142 } } },
    ]);
  });

  test('page 0 on a Read book opens a reread and sets no page', async () => {
    const { deps, mutations } = library({
      id: 456,
      status_id: 3,
      user_book_reads: [{ id: 12, finished_at: '2020-01-01', progress_pages: 300 }],
    });

    await run(logToHardcover(deps, BOOK, { reading: { finished: false, page: 0 }, date: '2026-11-12' }));

    expect(mutations).toEqual([
      { name: 'update_user_book', variables: { id: 456, object: { status_id: 2, user_date: '2026-11-12' } } },
    ]);
  });
});

describe('logToHardcover — refusals', () => {
  test('an error in the mutation body fails the write', async () => {
    const { deps } = library(null, { mutationError: 'Book not found' });

    const result = await run(logToHardcover(deps, BOOK, { reading: { finished: true }, ...PAST }));

    expect(result).toMatchObject({ _tag: 'Failure', failure: { _tag: 'ProviderNetworkError', retryable: false } });
  });

  test('an item with no Hardcover id sends nothing', async () => {
    const { deps, mutations } = library(null);

    const result = await run(
      logToHardcover(deps, { ...BOOK, externalIds: {} }, { reading: { finished: true }, ...PAST }),
    );

    expect(result._tag).toBe('Failure');
    expect(mutations).toEqual([]);
  });
});

describe('the reading list', () => {
  test('Want to Read is written only for a book that is not in the library', async () => {
    const absent = library(null);
    const reading = library({ id: 456, status_id: 2, user_book_reads: [] });

    await run(addToHardcoverReadingList(absent.deps, BOOK));
    const refused = await run(addToHardcoverReadingList(reading.deps, BOOK));

    expect(absent.mutations).toEqual([
      { name: 'insert_user_book', variables: { object: { book_id: 427578, status_id: 1 } } },
    ]);
    expect(refused).toMatchObject({
      success: { status: 'skipped', reason: 'Hardcover already tracks this as Currently Reading' },
    });
    expect(reading.mutations).toEqual([]);
  });

  test('a failed library read sends no mutation, on the add and on the removal', async () => {
    const { deps, mutations } = library(null, { readFails: true });

    const added = await run(addToHardcoverReadingList(deps, BOOK));
    const removed = await run(removeFromHardcoverReadingList(deps, BOOK));

    expect([added._tag, removed._tag]).toEqual(['Failure', 'Failure']);
    expect(mutations).toEqual([]);
  });

  test('the removal deletes only a bare Want to Read entry', async () => {
    const bare = library({ id: 456, status_id: 1, user_book_reads: [] });
    const rated = library({ id: 456, status_id: 1, rating: 4.5, user_book_reads: [] });
    const read = library({
      id: 456,
      status_id: 3,
      user_book_reads: [{ id: 12, finished_at: '2020-01-01', progress_pages: 300 }],
    });

    await run(removeFromHardcoverReadingList(bare.deps, BOOK));
    const keptRating = await run(removeFromHardcoverReadingList(rated.deps, BOOK));
    const keptRead = await run(removeFromHardcoverReadingList(read.deps, BOOK));

    expect(bare.mutations).toEqual([{ name: 'delete_user_book', variables: { id: 456 } }]);
    expect(keptRating).toMatchObject({ success: { status: 'skipped' } });
    expect(keptRead).toMatchObject({ success: { status: 'skipped', reason: 'Hardcover tracks this as Read' } });
    expect([...rated.mutations, ...read.mutations]).toEqual([]);
  });
});
