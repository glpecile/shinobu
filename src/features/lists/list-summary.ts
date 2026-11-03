import { formatCount } from '@/lib/format-count';
import { letterboxdListUrl, type LetterboxdList } from '@/lib/providers/letterboxd/lists';
import { serializdListUrl, type SerializdList } from '@/lib/providers/serializd/lists';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import type { NormalizedMediaItem } from '@/types/media';

/** One list as cards, rails, and the list sheet show it, whichever provider holds it. */
export type ListSummary = {
  id: string;
  title: string;
  owner: string;
  previews: NormalizedMediaItem[];
  /** "1,250 films", or '' when the provider didn't say. */
  count: string;
  href: string;
  url: string;
} & ({ provider: typeof Provider.Letterboxd; slug: string } | { provider: typeof Provider.Serializd });

function countLabel(count: number | undefined, noun: string) {
  return count == null ? '' : `${formatCount(count)} ${noun}${count === 1 ? '' : 's'}`;
}

export function letterboxdListSummary(list: LetterboxdList): ListSummary {
  return {
    ...list, provider: Provider.Letterboxd, count: countLabel(list.filmCount, 'film'),
    href: routes.letterboxdList(list.owner, list.slug),
    url: letterboxdListUrl(list.owner, list.slug) ?? '',
  };
}

export function serializdListSummary(list: SerializdList): ListSummary {
  return {
    ...list, provider: Provider.Serializd, count: countLabel(list.itemCount, 'item'),
    href: routes.serializdList(list.id),
    url: serializdListUrl(list.id) ?? '',
  };
}

/** "12 films · by gian", for labels and the sheet's subtitle. */
export function listMeta(list: Pick<ListSummary, 'count' | 'owner'>) {
  return list.count === '' ? `by ${list.owner}` : `${list.count} · by ${list.owner}`;
}
