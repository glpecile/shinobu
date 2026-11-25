import { Redirect, useLocalSearchParams } from 'expo-router';

import { routes } from '@/lib/routes';
import type { MediaType } from '@/types/media';

export default function LegacyDetailsRoute() {
  const { id, mediaType } = useLocalSearchParams<{ id?: string; mediaType?: MediaType }>();
  return <Redirect href={typeof id === 'string' && id.indexOf('-') > 0 ? routes.details(id, mediaType) : routes.home} />;
}
