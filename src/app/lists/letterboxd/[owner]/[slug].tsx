import { useLocalSearchParams } from 'expo-router';

import { LetterboxdListFilms, ListFilmsSkeleton } from '@/features/lists/letterboxd-list-detail';
import { canLikeList } from '@/features/lists/list-like-button';
import { ListsPage } from '@/features/lists/lists-page';
import { letterboxdListUrl } from '@/lib/providers/letterboxd/lists';
import { routes } from '@/lib/routes';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';

export default function LetterboxdListScreen() {
  const { owner, slug } = useLocalSearchParams<{ owner: string | string[]; slug: string | string[] }>();
  const username = useConnectedProviders().includes('letterboxd') ? getLetterboxdUsername() : null;
  const valid = typeof owner === 'string' && typeof slug === 'string';
  const url = valid ? letterboxdListUrl(owner, slug) : null;
  const shareHref = valid ? routes.letterboxdList(owner, slug) : undefined;
  const likeButton = typeof owner === 'string' && canLikeList(username, owner);
  const owned = typeof owner === 'string' && username != null && username.toLowerCase() === owner.toLowerCase();
  return (
    <ListsPage fallback={<ListFilmsSkeleton likeButton={likeButton} owned={owned} shareHref={shareHref} />} key={username} provider="letterboxd" shareHref={shareHref} url={url}>
      {valid && url != null && <LetterboxdListFilms key={url} owner={owner} slug={slug} url={url} username={username} />}
    </ListsPage>
  );
}
