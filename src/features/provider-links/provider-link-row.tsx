import { View } from 'react-native';

import { Button } from '@/components/button';
import { ProviderIcon } from '@/components/provider-icon';
import { haptics } from '@/lib/haptics';
import { openExternalUrl } from '@/lib/open-external-url';
import type { ProviderLink } from '@/lib/providers/provider-links';
import { PROVIDERS } from '@/lib/providers/registry';

/** onOpened fires on native only: opening a new tab on web steals focus and makes closing the sheet animate in the background. */
export function ProviderLinkRow({
  link,
  onOpened,
  className,
}: {
  link: ProviderLink;
  onOpened?: () => void;
  className?: string;
}) {
  return (
    <Button
      {...(className != null ? { className } : {})}
      icon={<ProviderIcon id={link.provider} size={18} />}
      label={`View on ${PROVIDERS[link.provider].label}`}
      onPress={() => {
        haptics.selection();
        void openExternalUrl(link.url);
        if (process.env.EXPO_OS !== 'web') onOpened?.();
      }}
      variant="quiet"
    />
  );
}

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
