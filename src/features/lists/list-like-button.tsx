import { LikeButton } from '@/components/like-button';
import { Tooltip } from '@/components/tooltip';
import { openExternalUrl } from '@/lib/open-external-url';
import { useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import { toast } from '@/lib/toast';
import { useLetterboxdListLike } from '@/state/queries/letterboxd';
import { useHasLetterboxdWriteSession } from '@/state/session/letterboxd';

/** Own lists never take a like, and owner vs. username is known before any query resolves. */
export function canLikeList(username: string | null, owner: string) {
  return username != null && username.toLowerCase() !== owner.toLowerCase();
}

export function ListLikeButton({ username, owner, slug, url, size = 'sm', variant = 'quiet' }: { username: string; owner: string; slug: string; url: string; size?: 'sm' | 'md'; variant?: 'quiet' | 'ghost' }) {
  const mutation = useLetterboxdListLike(username, owner, slug);
  const hasSession = useHasLetterboxdWriteSession();
  const hasScript = useLetterboxdUserscript('list-like');
  const canWrite = process.env.EXPO_OS === 'web' ? hasScript : hasSession;
  if (!canLikeList(username, owner)) return null;
  const label = mutation.liked == null ? 'Check like status on Letterboxd' : canWrite ? mutation.liked ? 'Unlike list' : 'Like list' : 'Like / unlike on Letterboxd';
  return (
    <Tooltip label={label}>
      <LikeButton
        liked={mutation.liked}
        label={label}
        loading={mutation.isPending}
        size={size}
        variant={variant}
        onChange={(liked) => {
          if (!canWrite || mutation.liked == null) { void openExternalUrl(url); return; }
          mutation.mutate(liked, {
            onError: () => toast.error('Couldn’t confirm the change', 'Open this list with the Letterboxd button beside the heart before retrying.'),
          });
        }}
      />
    </Tooltip>
  );
}
