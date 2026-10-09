import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { Button } from '@/components/button';
import { ProviderIcon } from '@/components/provider-icon';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { Skeleton } from '@/components/skeleton';
import { cn } from '@/lib/cn';
import { openExternalUrl } from '@/lib/open-external-url';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';

export function ProviderListLink({ provider, url, iconOnly = false }: { provider: ProviderId; url: string; iconOnly?: boolean }) {
  return <Button icon={<Button.Icon name="open-outline" />} iconOnly={iconOnly} label={`View on ${PROVIDERS[provider].label}`} onPress={() => void openExternalUrl(url)} variant="quiet" />;
}

/** Omitting the title preserves the header's geometry while a detail loads. */
export function ListsHeader({ provider, title }: { provider: ProviderId; title?: string }) {
  const router = useRouter();
  return (
    <View className={cn('flex-row items-center gap-3 px-6 pb-4', screenHeaderTopPadding)}>
      <BackButton className="-ml-2" onPress={() => router.canGoBack() ? router.back() : router.replace(routes.home)} />
      <ProviderIcon id={provider} size={20} />
      {title == null ? <Skeleton className="h-8 w-56 rounded" /> : (
        <Text className="font-display text-foreground text-2xl flex-1" numberOfLines={2}>{title}</Text>
      )}
    </View>
  );
}
