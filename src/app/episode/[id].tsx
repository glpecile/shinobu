import { Redirect, useLocalSearchParams } from 'expo-router';

import { routes } from '@/lib/routes';

/** Preserve shared episodes whose season and number were query parameters. */
export default function LegacyEpisodeRoute() {
  const { id, season, number } = useLocalSearchParams<{
    id?: string; season?: string; number?: string;
  }>();
  if (typeof id !== 'string' || id.indexOf('-') < 1) return <Redirect href={routes.home} />;
  const episodeNumber = Number(number);
  if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) return <Redirect href={routes.details(id, 'TV')} />;
  if (season == null) return <Redirect href={routes.animeEpisode(id, episodeNumber)} />;
  const seasonNumber = Number(season);
  return <Redirect href={Number.isInteger(seasonNumber) && seasonNumber >= 0
    ? routes.episode(id, seasonNumber, episodeNumber)
    : routes.details(id, 'TV')} />;
}
