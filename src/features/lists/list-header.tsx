import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { Button } from '@/components/button';
import { MorphText } from '@/components/morph-text';
import { ProviderIcon } from '@/components/provider-icon';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { Skeleton } from '@/components/skeleton';
import { ShareButton } from '@/components/share-button';
import { Tooltip } from '@/components/tooltip';
import { cn } from '@/lib/cn';
import { openExternalUrl } from '@/lib/open-external-url';
import { useLinkHandoff } from '@/lib/open-external-url/use-link-handoff';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';

export function ProviderListLink({ provider, url, iconOnly = false, size = iconOnly ? 'sm' : 'md' }: { provider: ProviderId; url: string; iconOnly?: boolean; size?: 'sm' | 'md' }) {
  const { loading, open } = useLinkHandoff(() => openExternalUrl(url, { inApp: false }));
  const label = `View on ${PROVIDERS[provider].label}`;
  const button = <Button icon={<Button.Icon name="open-outline" />} iconOnly={iconOnly} label={label} loading={loading} onPress={open} size={size} variant="quiet" />;
  return iconOnly ? <Tooltip label={label}>{button}</Tooltip> : button;
}

/**
 * An icon-only button in a toolbar. Its 44px hit area overhangs the 38px
 * circle by 3px a side; pulling in by that much keeps every visible gap the
 * toolbar's own.
 */
export function ToolbarIcon({ children }: { children: ReactNode }) {
  return <View className="-mx-0.75">{children}</View>;
}

/**
 * Omitting the title preserves the header's geometry while a detail loads.
 * Index titles ("Your Lists"/"Liked Lists") morph instead: they are short,
 * single-line, and change from the kind filter's user state.
 */
export function ListsHeader({ provider, title, subtitle, metadata, shareHref, morphTitle = false }: { provider: ProviderId; title?: string; subtitle?: string; metadata?: ReactNode; shareHref?: string; morphTitle?: boolean }) {
  const router = useRouter();
  return (
    <View className={cn('flex-row items-center gap-3 px-6 pb-4', screenHeaderTopPadding)}>
      <BackButton className="-ml-2" onPress={() => router.canGoBack() ? router.back() : router.replace(routes.home)} />
      <View className="flex-1 min-w-0 gap-1">
        <View className="flex-row items-center gap-2">
          <ProviderIcon id={provider} size={16} />
          {title == null ? <View className="flex-1 min-w-0" style={process.env.EXPO_OS === 'web' ? { maxWidth: 224 } : undefined}>
            <Text className="font-display text-xl" numberOfLines={1}>{'\u00a0'}</Text>
            <Skeleton className="absolute inset-0 rounded-full" />
          </View> : morphTitle ? (
            <MorphText className="font-display text-foreground text-2xl">{title}</MorphText>
          ) : (
            <Text className="font-display text-foreground text-xl flex-1 min-w-0" ellipsizeMode="tail" numberOfLines={1}>{title}</Text>
          )}
        </View>
        {(subtitle != null || metadata != null) && <View className={cn('flex-row flex-wrap items-center gap-x-3 gap-y-1', metadata != null && 'min-h-5')} style={{ alignContent: 'center' }}>
          {subtitle != null && (title == null ? <Skeleton className="h-4 w-24 rounded-full" /> : <Text className="font-sans text-muted text-xs" numberOfLines={1}>{subtitle}</Text>)}
          {metadata}
        </View>}
      </View>
      {shareHref != null && <View className="-mr-2 shrink-0"><Tooltip label="Share"><ShareButton href={shareHref} /></Tooltip></View>}
    </View>
  );
}
