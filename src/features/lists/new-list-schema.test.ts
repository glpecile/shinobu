import { expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';
import { newListSchema, type NewListForm } from './new-list-schema';

const film = { id: 'tmdb-movie-550', title: 'Fight Club', coverImage: '', type: 'MOVIE', currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { tmdb: 550 } } satisfies NormalizedMediaItem;
const show = { ...film, id: 'tmdb-tv-1396', type: 'TV', externalIds: { tmdb: 1396 } } satisfies NormalizedMediaItem;
const form: NewListForm = { provider: 'letterboxd', name: ' Classics ', description: '', tags: 'Top 10, top 10, cosy', sharing: 'Friends', isPrivate: false, ranked: true, allowsComments: false, items: [film, show] };

function issues(values: Partial<NewListForm>) {
  const result = newListSchema.safeParse({ ...form, ...values });
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
}

test('parses each provider into its draft, keeping only titles it takes', () => {
  expect(newListSchema.parse(form)).toEqual({ provider: 'letterboxd', draft: { name: 'Classics', description: '', tags: ['top 10', 'cosy'], sharing: 'Friends', ranked: true, items: [film] } });
  expect(newListSchema.parse({ ...form, provider: 'serializd' })).toEqual({ provider: 'serializd', draft: { name: 'Classics', description: '', isPrivate: false, isRanked: true, allowsComments: false, items: [show] } });
});

test('reports every provider rule at once', () => {
  expect(issues({ provider: 'serializd', name: ' ', items: [film] })).toEqual({ name: 'Give the list a name.', items: 'Serializd lists start with at least one show.' });
  expect(issues({ provider: 'serializd', items: Array.from({ length: 501 }, (_, index) => ({ ...show, id: `tmdb-tv-${index}` })) })).toEqual({ items: 'Serializd lists hold up to 500 shows.' });
  expect(issues({ items: Array.from({ length: 51 }, (_, index) => ({ ...film, id: `tmdb-movie-${index}` })) })).toEqual({ items: 'Start with up to 50 films, then add the rest from the list.' });
  expect(issues({ name: 'x'.repeat(501), description: 'x'.repeat(10_001), tags: 'x'.repeat(201) })).toEqual({ name: 'Keep the name under 500 characters.', description: 'Keep the description under 10,000 characters.', tags: 'Keep each tag under 200 characters.' });
  expect(issues({ tags: Array.from({ length: 101 }, (_, index) => `t${index}`).join(',') })).toEqual({ tags: 'Use up to 100 tags.' });
});
