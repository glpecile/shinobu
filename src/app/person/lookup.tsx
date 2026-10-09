import { Redirect, useLocalSearchParams } from 'expo-router';

import { routes } from '@/lib/routes';

export default function LegacyPersonLookupRoute() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  return <Redirect href={typeof name === 'string' && name !== '' ? routes.personLookup(name) : routes.home} />;
}
