import { Redirect, useLocalSearchParams } from 'expo-router';

import { routes } from '@/lib/routes';

export default function LegacyStudioLookupRoute() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  return <Redirect href={typeof name === 'string' && name !== '' ? routes.studioLookup(name) : routes.home} />;
}
