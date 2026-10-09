import { Button } from '@/components/button';
import { openExternalUrl } from '@/lib/open-external-url';
import { useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import { toast } from '@/lib/toast';
import { useLetterboxdListLike } from '@/state/queries/letterboxd';
import { useHasLetterboxdWriteSession } from '@/state/session/letterboxd';

export function ListLikeButton({ username, owner, slug, url }: { username: string; owner: string; slug: string; url: string }) {
  const mutation = useLetterboxdListLike(username, owner, slug);
  const hasSession = useHasLetterboxdWriteSession();
  const hasScript = useLetterboxdUserscript('list-like');
  const canWrite = process.env.EXPO_OS === 'web' ? hasScript : hasSession;
  if (username.toLowerCase() === owner.toLowerCase()) return null;
  return (
    <Button
      icon={<Button.Icon name={mutation.liked ? 'heart' : 'heart-outline'} />}
      iconOnly
      label={canWrite ? mutation.liked ? 'Unlike list' : 'Like list' : 'Like / unlike on Letterboxd'}
      loading={mutation.isPending}
      onPress={() => {
        if (!canWrite) { void openExternalUrl(url); return; }
        mutation.mutate(!mutation.liked, {
          onError: () => toast.error('Couldn’t confirm the change', 'Open this list with the Letterboxd button beside the heart before retrying.'),
        });
      }}
      pressed={mutation.liked}
      variant={mutation.liked ? 'outline' : 'quiet'}
    />
  );
}
