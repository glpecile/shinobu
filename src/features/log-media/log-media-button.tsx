import { useState } from 'react';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { haptics } from '@/lib/haptics';
import { providersForLog } from '@/lib/providers/routing';
import { useTraktWatchedInfo } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { useLogMedia } from './use-log-media';
import { labels, LogConfirmSheet } from './log-confirm-sheet';

/**
 * The movie/anime-film log trigger (plan 0008). A write to external trackers
 * shouldn't ride on one stray tap, so the button only *opens* a confirmation
 * sheet (`LogConfirmSheet` — shared with the TV season picker, plan 0010); the
 * actual mutation fires from the sheet's confirm action, with haptic feedback
 * on commit/success/failure. Renders only for items loggable without an
 * episode choice — movies and anime films; TV uses the season picker.
 */
export function LogMediaButton({ item }: { item: NormalizedMediaItem }) {
  const connected = useConnectedProviders();
  const logMedia = useLogMedia();
  const isRewatch = useTraktWatchedInfo(item) != null;
  const [open, setOpen] = useState(false);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);

  const oneTapLoggable =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  const targets = providersForLog(item, connected);
  if (!oneTapLoggable || targets.length === 0) return null;

  const result = logMedia.data;

  function confirmLog() {
    if (logMedia.isPending) return;
    haptics.confirm();
    logMedia.mutate(
      {
        item,
        ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
      },
      {
        onSuccess: (outcome) => {
          if (outcome.failed.length === 0) {
            haptics.success();
            setOpen(false);
          } else {
            haptics.error();
          }
        },
        onError: () => haptics.error(),
      },
    );
  }

  return (
    <View className="mb-6">
      <PresstableOpacity
        className="bg-accent rounded px-5 py-3"
        onPress={() => {
          haptics.selection();
          logMedia.reset();
          setWatchedAt(null);
          setOpen(true);
        }}
      >
        <Text className="text-accent-foreground font-sans-semibold text-base text-center">
          {isRewatch ? 'Log rewatch' : 'Mark as watched'}
        </Text>
      </PresstableOpacity>
      {result != null && result.succeeded.length > 0 && (
        <Text className="text-muted font-sans text-sm mt-2">
          {isRewatch ? 'Logged rewatch to' : 'Logged to'}{' '}
          {labels(result.succeeded)}.
        </Text>
      )}
      {result != null && result.failed.length > 0 && (
        <Text className="text-accent font-sans text-sm mt-2">
          Failed on {labels(result.failed)}.
        </Text>
      )}

      <LogConfirmSheet
        onClose={() => setOpen(false)}
        confirmLabel={
          isRewatch ? `Log rewatch on ${labels(targets)}` : `Log watch on ${labels(targets)}`
        }
        description={
          isRewatch
            ? `“${item.title}” is already in your history — this logs another watch.`
            : `Mark “${item.title}” as watched.`
        }
        logMedia={logMedia}
        onConfirm={confirmLog}
        onWatchedAtChange={setWatchedAt}
        open={open}
        pendingLabel="Logging…"
        targets={targets}
        title={isRewatch ? 'Log rewatch' : 'Log watch'}
        watchedAt={watchedAt}
      />
    </View>
  );
}