import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { openExternalUrl } from '@/lib/open-external-url';
import type { ProviderLink } from '@/lib/providers/provider-links';
import { PROVIDERS } from '@/lib/providers/registry';

/**
 * A "View on …" row, the *sheet* treatment of a provider link — full-width and
 * bordered, sitting flush with the other action rows above it. The pages use
 * pills instead (`ProviderLinksSection`, `PersonLinksSection`): a page has room
 * to lay links out as a cluster, a sheet is a stack of one-tap actions and a
 * row of pills reads as a different kind of control in the middle of it.
 *
 * `onOpened` fires **on native only**: a new tab steals focus on web, so
 * closing the sheet there would animate it shut in a backgrounded tab, which
 * reads as broken when the user switches back.
 */
export function ProviderLinkRow({
  link,
  onOpened,
  className,
}: {
  link: ProviderLink;
  onOpened?: () => void;
  className?: string;
}) {
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;

  return (
    <PresstableOpacity
      accessibilityRole="button"
      className={cn(
        'flex-row items-center gap-3 rounded px-5 py-3 border border-border',
        className,
      )}
      onPress={() => {
        haptics.selection();
        void openExternalUrl(link.url);
        if (process.env.EXPO_OS !== 'web') onOpened?.();
      }}
    >
      <ProviderIcon id={link.provider} size={18} />
      <Text className="text-foreground font-sans-semibold text-base flex-1">
        View on {PROVIDERS[link.provider].label}
      </Text>
      <Ionicons color={mutedColor} name="open-outline" size={16} />
    </PresstableOpacity>
  );
}

/** Convenience wrapper: the rows as a stack, spaced like the sheet's actions. */
export function ProviderLinkRows({
  links,
  onOpened,
  className,
}: {
  links: readonly ProviderLink[];
  onOpened?: () => void;
  className?: string;
}) {
  if (links.length === 0) return null;
  return (
    <View className={className}>
      {links.map((link, index) => (
        <ProviderLinkRow
          className={index === 0 ? undefined : 'mt-2'}
          key={link.provider}
          link={link}
          onOpened={onOpened}
        />
      ))}
    </View>
  );
}
