import { Redirect, useLocalSearchParams } from 'expo-router';

import { ListsPage } from '@/features/lists/lists-page';
import { letterboxdListUrl } from '@/lib/providers/letterboxd/lists';
import { serializdListUrl } from '@/lib/providers/serializd/lists';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';

/** Preserve shared links from before list identities moved into resource paths. */
export default function LegacyListsScreen() {
  const { provider = Provider.Letterboxd, kind, owner, slug, id } = useLocalSearchParams<{
    provider?: string | string[]; kind?: string | string[];
    owner?: string | string[]; slug?: string | string[]; id?: string | string[];
  }>();
  switch (provider) {
    case Provider.Letterboxd:
      if (id != null) break;
      if (owner != null || slug != null) {
        if (typeof owner !== 'string' || typeof slug !== 'string' || kind != null || letterboxdListUrl(owner, slug) == null) break;
        return <Redirect href={routes.letterboxdList(owner, slug)} />;
      }
      if (kind != null && kind !== 'created' && kind !== 'liked') break;
      return <Redirect href={routes.letterboxdLists(kind ?? 'created')} />;
    case Provider.Serializd:
      if (owner != null || slug != null) break;
      if (id != null) {
        if (typeof id !== 'string' || kind != null || serializdListUrl(id) == null) break;
        return <Redirect href={routes.serializdList(id)} />;
      }
      if (kind != null && kind !== 'created' && kind !== 'liked') break;
      return <Redirect href={routes.serializdLists(kind ?? 'created')} />;
  }
  return <ListsPage provider={provider === Provider.Serializd ? Provider.Serializd : Provider.Letterboxd} url={null} />;
}
