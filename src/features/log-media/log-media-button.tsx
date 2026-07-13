import { useState } from 'react';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { haptics } from '@/lib/haptics';
import { PROVIDERS } from '@/lib/providers/registry';
import { providersForLog } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import { useTraktWatchedInfo } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { useLogMedia } from './use-log-media';
import { WatchedAtField } from './watched-at-field';

function labels(ids: readonly ProviderId[]): string {
  return ids.map((id) => PROVIDERS[id].label).join(', ');
}

/**
 * The trigger for the log fan-out (plan 0008). A write to external trackers
 * shouldn't ride on one stray tap, so the button only *opens* a confirmation
 * sheet; the actual mutation fires from the sheet's confirm action, with
 * haptic feedback on commit/success/failure. Renders only for items loggable
 * without an episode choice — movies and anime films; TV needs a
 * season/episode picker (todos/006).
 */
export function LogMediaButton({ item }: { item: NormalizedMediaItem }) {
  const connected = useConnectedProviders();
  const logMedia = useLogMedia();
  // Already watched on Trakt → this log is a rewatch, and the copy says so.
  const isRewatch = useTraktWatchedInfo(item) != null;
  const [open, setOpen] = useState(false);
  // null = "just now": the mutation omits watchedAt and Trakt records now.
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
            // Partial failure keeps the sheet open so the per-provider
            // breakdown is read in context, not after the fact.
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
          // Stale outcomes/backdates from a previous log would misread as
          // this one's.
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

      <Sheet onClose={() => setOpen(false)} open={open}>
        <Text className="text-2xl font-display text-foreground">
          {isRewatch ? 'Log rewatch' : 'Log watch'}
        </Text>
        <Text className="text-muted font-sans text-sm mt-2 leading-relaxed">
          {isRewatch
            ? `“${item.title}” is already in your history — this logs another watch.`
            : `Mark “${item.title}” as watched.`}
        </Text>
        <Text className="text-foreground font-sans text-sm mt-4">
          Writes to{' '}
          <Text className="font-sans-semibold">{labels(targets)}</Text>
        </Text>
        <WatchedAtField onChange={setWatchedAt} value={watchedAt} />
        {result != null && result.failed.length > 0 && (
          <Text className="text-accent font-sans text-sm mt-3">
            Failed on {labels(result.failed)}
            {result.succeeded.length > 0
              ? ` — ${labels(result.succeeded)} was logged.`
              : '.'}
          </Text>
        )}
        {logMedia.isError && (
          <Text className="text-accent font-sans text-sm mt-3">
            Could not log. Try again.
          </Text>
        )}
        <PresstableOpacity
          className={`rounded px-5 py-3 mt-6 ${logMedia.isPending ? 'bg-accent/60' : 'bg-accent'}`}
          onPress={confirmLog}
        >
          <Text className="text-accent-foreground font-sans-semibold text-base text-center">
            {logMedia.isPending
              ? 'Logging…'
              : isRewatch
                ? `Log rewatch on ${labels(targets)}`
                : `Log watch on ${labels(targets)}`}
          </Text>
        </PresstableOpacity>
        <PresstableOpacity
          className="rounded px-5 py-3 mt-2 border border-border"
          onPress={() => setOpen(false)}
        >
          <Text className="text-foreground font-sans-semibold text-base text-center">
            Cancel
          </Text>
        </PresstableOpacity>
      </Sheet>
    </View>
  );
}
