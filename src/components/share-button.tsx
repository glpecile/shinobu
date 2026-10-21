import Ionicons from '@react-native-vector-icons/ionicons/static';
import { setStringAsync } from 'expo-clipboard';
import type { ComponentProps, ReactNode } from 'react';
import { Share, View } from 'react-native';

import { Button } from '@/components/button';
import { ButtonCapsule } from '@/components/button-capsule';
import { RoundIconButton } from '@/components/round-icon-button';
import { Tooltip } from '@/components/tooltip';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import { SHINOBU_WEB_DOMAIN } from '@/lib/config';
import { useThemeColor } from '@/lib/theme-color';
import { toast } from '@/lib/toast';

/** Share public website links, never a dev-client or app-scheme URL. */
export async function shareLink(href: string) {
  const url = `${SHINOBU_WEB_DOMAIN}${href}`;
  try {
    if (process.env.EXPO_OS === 'web' && typeof navigator.share !== 'function') {
      await setStringAsync(url);
      toast.success('Link copied');
      return;
    }
    await Share.share(process.env.EXPO_OS === 'android' ? { message: url } : { url });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return;
    toast.error('Could not share link');
  }
}

/** `BackButton`'s counterpart: one Share glyph and shape, in a header or floating over art. */
export function ShareButton({
  href,
  ...props
}: { href: string } & Omit<ComponentProps<typeof RoundIconButton>, 'icon' | 'label' | 'onPress'>) {
  const foreground = useThemeColor('--color-foreground');
  return (
    <RoundIconButton
      {...props}
      icon={<Ionicons color={foreground} name="share-outline" size={20} />}
      label="Share"
      onPress={() => void shareLink(href)}
    />
  );
}

/** A sheet's main action with Share capsuled beside it, as the list sheet lays it out. */
export function WithShareButton({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <View className={cn('flex-row items-center gap-2', className)}>
      <View className="flex-1">{children}</View>
      <ButtonCapsule>
        <Tooltip label="Share">
          <Button icon={<Button.Icon name="share-outline" />} iconOnly label="Share" onPress={() => { haptics.selection(); void shareLink(href); }} variant="ghost" />
        </Tooltip>
      </ButtonCapsule>
    </View>
  );
}
