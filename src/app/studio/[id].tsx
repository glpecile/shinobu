import { Redirect, useLocalSearchParams } from 'expo-router';

import { routes } from '@/lib/routes';

export default function LegacyStudioRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tmdbId = typeof id === 'string' ? Number(id) : Number.NaN;
  return <Redirect href={Number.isSafeInteger(tmdbId) && tmdbId > 0 ? routes.studio(tmdbId) : routes.home} />;
}
