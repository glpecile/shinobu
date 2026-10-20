import { z } from 'zod';

import { parseTags } from '@/features/log-media/parse-tags';
import { MAX_NEW_LIST_FILMS } from '@/lib/providers/letterboxd/lists';
import { MAX_SERIALIZD_LIST_ITEMS } from '@/lib/providers/serializd/lists';
import type { NewList } from '@/state/queries/list-membership';
import type { NormalizedMediaItem } from '@/types/media';

export type ListProvider = NewList['provider'];

export function fitsProvider(provider: ListProvider, item: NormalizedMediaItem) {
  return provider === 'letterboxd' ? item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true) : item.type === 'TV';
}

/**
 * The editor's rules, from what each provider's own editor enforces (plan 0097)
 * and the caps the Letterboxd userscript checks before it opens a tab: a name,
 * Serializd's 1–500 shows, Letterboxd's lowercased, de-duplicated tags. One flat
 * form covers both providers; `provider` decides which rules apply and what
 * the parsed value carries.
 */
export const newListSchema = z.object({
  provider: z.enum(['letterboxd', 'serializd']),
  name: z.string().trim(),
  description: z.string().trim(),
  tags: z.string().transform((input) => [...new Set(parseTags(input).map((tag) => tag.toLowerCase()))]),
  sharing: z.enum(['Public', 'Anyone', 'Friends', 'You']),
  isPrivate: z.boolean(),
  ranked: z.boolean(),
  allowsComments: z.boolean(),
  items: z.array(z.custom<NormalizedMediaItem>()),
// Every rule lives in one refinement: a failing field would skip an
// object-level one, hiding the list's other problems until the next submit.
}).superRefine((form, ctx) => {
  if (form.name === '') ctx.addIssue({ code: 'custom', path: ['name'], message: 'Give the list a name.' });
  if (form.name.length > 500) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Keep the name under 500 characters.' });
  if (form.description.length > 10_000) ctx.addIssue({ code: 'custom', path: ['description'], message: 'Keep the description under 10,000 characters.' });
  const items = form.items.filter((item) => fitsProvider(form.provider, item));
  switch (form.provider) {
    case 'letterboxd':
      if (form.tags.length > 100) ctx.addIssue({ code: 'custom', path: ['tags'], message: 'Use up to 100 tags.' });
      if (form.tags.some((tag) => tag.length > 200)) ctx.addIssue({ code: 'custom', path: ['tags'], message: 'Keep each tag under 200 characters.' });
      if (items.length > MAX_NEW_LIST_FILMS) ctx.addIssue({ code: 'custom', path: ['items'], message: `Start with up to ${MAX_NEW_LIST_FILMS} films, then add the rest from the list.` });
      return;
    case 'serializd':
      if (items.length === 0) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Serializd lists start with at least one show.' });
      if (items.length > MAX_SERIALIZD_LIST_ITEMS) ctx.addIssue({ code: 'custom', path: ['items'], message: `Serializd lists hold up to ${MAX_SERIALIZD_LIST_ITEMS} shows.` });
  }
}).transform((form): NewList => {
  const items = form.items.filter((item) => fitsProvider(form.provider, item));
  switch (form.provider) {
    case 'letterboxd':
      return { provider: 'letterboxd', draft: { name: form.name, description: form.description, tags: form.tags, sharing: form.sharing, ranked: form.ranked, items } };
    case 'serializd':
      return { provider: 'serializd', draft: { name: form.name, description: form.description, isPrivate: form.isPrivate, isRanked: form.ranked, allowsComments: form.allowsComments, items } };
  }
});

export type NewListForm = z.input<typeof newListSchema>;
