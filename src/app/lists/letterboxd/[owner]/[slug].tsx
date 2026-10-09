import { useLocalSearchParams } from 'expo-router';

import { LetterboxdListFilms, ListFilmsSkeleton } from '@/features/lists/letterboxd-list-detail';
import { ListsPage } from '@/features/lists/lists-page';
import { letterboxdListUrl } from '@/lib/providers/letterboxd/lists';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';

export default function LetterboxdListScreen() {
  const { owner, slug } = useLocalSearchParams<{ owner: string | string[]; slug: string | string[] }>();
  const username = useConnectedProviders().includes('letterboxd') ? getLetterboxdUsername() : null;
  const url = typeof owner === 'string' && typeof slug === 'string' ? letterboxdListUrl(owner, slug) : null;
  return (
    <ListsPage fallback={<ListFilmsSkeleton />} key={username} provider="letterboxd" url={url}>
      {url != null && typeof owner === 'string' && typeof slug === 'string' && <LetterboxdListFilms owner={owner} slug={slug} url={url} username={username} />}
    </ListsPage>
  );
}
