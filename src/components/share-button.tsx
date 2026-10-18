import { setStringAsync } from 'expo-clipboard';
import { Share } from 'react-native';

import { Button } from '@/components/button';
import { Tooltip } from '@/components/tooltip';
import { SHINOBU_WEB_DOMAIN } from '@/lib/config';
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

/** The share action for a tool row; `FloatingShareButton` is the same action pinned to a screen corner. */
export function ShareButton({ href }: { href: string }) {
  const label = 'Share';
  return (
    <Tooltip label={label}>
      <Button icon={<Button.Icon name="share-outline" />} iconOnly label={label} onPress={() => void shareLink(href)} size="sm" variant="quiet" />
    </Tooltip>
  );
}
