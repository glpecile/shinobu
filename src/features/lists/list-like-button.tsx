import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { openExternalUrl } from '@/lib/open-external-url';
import { useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import { useLetterboxdListLike } from '@/state/queries/letterboxd';
import { useHasLetterboxdWriteSession } from '@/state/session/letterboxd';

export function ListLikeButton({ username, owner, slug, url }: { username: string; owner: string; slug: string; url: string }) {
  const mutation = useLetterboxdListLike(username, owner, slug);
  const hasSession = useHasLetterboxdWriteSession();
  const hasScript = useLetterboxdUserscript('list-like');
  const canWrite = process.env.EXPO_OS === 'web' ? hasScript : hasSession;
  if (username.toLowerCase() === owner.toLowerCase()) return null;
  return (
    <View className="items-start gap-2 px-6 pb-3">
      <Button
        icon={<Button.Icon name={mutation.liked ? 'heart' : 'heart-outline'} />}
        label={canWrite ? mutation.liked ? 'Unlike list' : 'Like list' : 'Like / unlike on Letterboxd'}
        loading={mutation.isPending}
        morphLabel
        onPress={() => { if (canWrite) mutation.mutate(!mutation.liked); else void openExternalUrl(url); }}
        variant="quiet"
      />
      {mutation.isError && <>
        <Text accessibilityRole="alert" className="font-sans text-error text-sm">Couldn’t confirm the change. Check this list on Letterboxd before retrying.</Text>
        <Button icon={<Button.Icon name="open-outline" />} label="Open list on Letterboxd" onPress={() => void openExternalUrl(url)} variant="quiet" />
      </>}
    </View>
  );
}
