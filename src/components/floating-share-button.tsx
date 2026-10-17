import Ionicons from '@react-native-vector-icons/ionicons/static';
import { setStringAsync } from 'expo-clipboard';
import { Share } from 'react-native';

import { useFloatingBackButtonTop } from '@/components/floating-back-button';
import { RoundIconButton } from '@/components/round-icon-button';
import { SHINOBU_WEB_DOMAIN } from '@/lib/config';
import { useThemeColor } from '@/lib/theme-color';
import { toast } from '@/lib/toast';

/** Share public website links, never a dev-client or app-scheme URL. */
export function FloatingShareButton({ href }: { href: string }) {
  const top = useFloatingBackButtonTop();
  const foreground = useThemeColor('--color-foreground');

  async function share() {
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

  return (
    <RoundIconButton
      className="absolute right-4"
      icon={<Ionicons color={foreground} name="share-outline" size={20} />}
      label="Share"
      onPress={() => void share()}
      style={{ top }}
    />
  );
}
