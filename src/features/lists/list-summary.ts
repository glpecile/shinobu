import { formatCount } from '@/lib/format-count';
import {
  hardcoverListUrl,
  hardcoverListsUrl,
  type HardcoverList,
} from '@/lib/providers/hardcover/lists';
import { letterboxdListUrl, type LetterboxdList } from '@/lib/providers/letterboxd/lists';
import { serializdListUrl, type SerializdList } from '@/lib/providers/serializd/lists';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import type { NormalizedMediaItem } from '@/types/media';

export type ListSummary = {
  id: string;
  title: string;
  owner: string;
  previews: NormalizedMediaItem[];
  /** "1,250 films", or '' when the provider didn't say. */
  count: string;
  href: string;
  url: string;
} & (
  | { provider: typeof Provider.Letterboxd; slug: string }
  | { provider: typeof Provider.Serializd }
  | { provider: typeof Provider.Hardcover }
);

function countLabel(count: number | undefined, noun: string) {
  return count == null ? '' : `${formatCount(count)} ${noun}${count === 1 ? '' : 's'}`;
}

export function letterboxdListSummary(list: LetterboxdList): ListSummary {
  return {
    ...list,
    provider: Provider.Letterboxd,
    count: countLabel(list.filmCount, 'film'),
    href: routes.letterboxdList(list.owner, list.slug),
    url: letterboxdListUrl(list.owner, list.slug) ?? '',
  };
}

export function serializdListSummary(list: SerializdList): ListSummary {
  return {
    ...list,
    provider: Provider.Serializd,
    count: countLabel(list.itemCount, 'item'),
    href: routes.serializdList(list.id),
    url: serializdListUrl(list.id) ?? '',
  };
}

export function hardcoverListSummary(list: HardcoverList): ListSummary {
  return {
    ...list,
    provider: Provider.Hardcover,
    count: countLabel(list.bookCount, 'book'),
    href: routes.hardcoverList(list.id),
    url: hardcoverListUrl(list.owner, list.slug) ?? hardcoverListsUrl(list.owner),
  };
}

export function listMeta(list: Pick<ListSummary, 'count' | 'owner'>) {
  return list.count === '' ? `by ${list.owner}` : `${list.count} · by ${list.owner}`;
}
