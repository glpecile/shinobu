import { Redirect, useLocalSearchParams } from 'expo-router';

import { parseAniListItemId } from '@/lib/providers/anilist/normalize';
import { routes } from '@/lib/routes';

/** Bare IDs were TMDB people; anilist-<id> identified AniList staff. */
export default function LegacyPersonRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (typeof id !== 'string') return <Redirect href={routes.home} />;
  const anilistId = parseAniListItemId(id);
  if (anilistId != null) return <Redirect href={routes.anilistPerson(anilistId)} />;
  const tmdbId = Number(id);
  return <Redirect href={Number.isSafeInteger(tmdbId) && tmdbId > 0 ? routes.person(tmdbId) : routes.home} />;
}
