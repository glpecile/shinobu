import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableScale } from '@/components/presstable';
import {
  confirmLabelFor,
  LogConfirmSheet,
} from '@/features/log-media/log-confirm-sheet';
import { parseTags } from '@/features/log-media/parse-tags';
import {
  prefetchLogReconcile,
  useLogMedia,
} from '@/features/log-media/use-log-media';
import { useLogTargetsSplit } from '@/features/log-media/use-log-targets';
import type { UpNextEntry } from '@/features/up-next/types';
import { haptics } from '@/lib/haptics';
import { useConnectedProviders } from '@/state/session';
import { useUpNextSettling } from '@/state/queries/up-next';

import {
  isQuickLogPending,
  resolveQuickLog,
  settleTransition,
  type QuickLogPhase,
} from './quick-log-state';

/**
 * The Continue Watching checkmark: tapping it opens a confirmation modal (the
 * same `LogConfirmSheet` every other log entry point uses), and confirming
 * logs *this* episode through the shared `useLogMedia` fan-out — never a
 * single-provider write (R7). The modal is deliberate: an external write
 * shouldn't ride on one stray tap, matching the rest of the app. Opening it
 * prefetches the reconcile reads so the confirmed write returns quickly.
 *
 * Nothing advances optimistically (KTD-6). Once a write succeeds, the modal
 * closes and the button holds a pending state until the invalidated Up Next
 * slot settles; the card then advances, moves, or disappears purely from
 * recomputed data — which is why an advancing card simply unmounts (its entry
 * id carries the episode number) rather than animating a local counter. The
 * card advances only when the entry's own *source* provider succeeded (R8/R9).
 */
const SETTLE_TIMEOUT_MS = 10_000;
const DEFAULT_TAGS = 'shinobu, ';

export function QuickLogButton({ entry }: { entry: UpNextEntry }) {
  const queryClient = useQueryClient();
  const connected = useConnectedProviders();
  const logMedia = useLogMedia();
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(entry.item);
  const fetching = useUpNextSettling();

  const [open, setOpen] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState(targets);
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);

  const [phase, setPhase] = useState<QuickLogPhase>('idle');
  const sawFetch = useRef(false);
  const [timedOut, setTimedOut] = useState(false);
  const accentForeground = useCSSVariable('--color-accent-foreground');
  const iconColor =
    typeof accentForeground === 'string' ? accentForeground : undefined;

  const episode = { season: entry.episode.season, number: entry.episode.number };

  // The settle watcher: `invalidateAfterLog` is fire-and-forget, so this is how
  // the button notices the refetch it caused — and how it stops waiting for one
  // that never lands.
  useEffect(() => {
    if (phase !== 'settling') return;
    if (fetching) sawFetch.current = true;
    const next = settleTransition({
      phase,
      fetching,
      sawFetch: sawFetch.current,
      timedOut,
    });
    if (next != null) setPhase(next);
  }, [phase, fetching, timedOut]);

  useEffect(() => {
    if (phase !== 'settling') return;
    const timer = setTimeout(() => setTimedOut(true), SETTLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const pending = isQuickLogPending(phase);

  function openConfirm() {
    if (pending) return;
    haptics.selection();
    logMedia.reset();
    setSelectedProviders(targets);
    setTags(DEFAULT_TAGS);
    setWatchedAt(null);
    setOpen(true);
    // Warm the reconcile reads while the user reads the modal, so confirming
    // doesn't wait on cold fetches.
    void prefetchLogReconcile(queryClient, entry.item, connected, [episode]);
  }

  function confirmLog() {
    if (logMedia.isPending || selectedProviders.length === 0) return;
    haptics.confirm();
    setTimedOut(false);
    sawFetch.current = false;
    const parsedTags = parseTags(tags);
    logMedia.mutate(
      {
        item: entry.item,
        episodes: [episode],
        providers: selectedProviders,
        ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
        ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
      },
      {
        onSuccess: (outcome) => {
          const resolved = resolveQuickLog(outcome, entry.source);
          if (resolved.phase === 'failed') {
            // The card's source write failed — keep the modal open showing the
            // failure (the sheet renders `logMedia.data`), don't advance.
            haptics.error();
            return;
          }
          haptics.success();
          setOpen(false);
          setPhase('settling');
        },
        onError: () => haptics.error(),
      },
    );
  }

  return (
    <View className="items-end">
      <PresstableScale
        accessibilityLabel={`Log episode ${entry.episode.number} of ${entry.item.title}`}
        accessibilityRole="button"
        accessibilityState={{ busy: pending, disabled: pending }}
        className={`w-9 h-9 items-center justify-center rounded-full ${
          phase === 'settle-failed' ? 'bg-surface border border-accent' : 'bg-accent'
        }`}
        onPress={openConfirm}
      >
        {pending ? (
          <ActivityIndicator color={iconColor} size="small" />
        ) : (
          <Ionicons
            color={iconColor}
            name={phase === 'settle-failed' ? 'refresh' : 'checkmark'}
            size={18}
          />
        )}
      </PresstableScale>
      {phase === 'settle-failed' && (
        <Text className="text-muted font-sans text-xs mt-1 text-right">
          Logged — refresh to update.
        </Text>
      )}

      <LogConfirmSheet
        confirmLabel={confirmLabelFor(
          `Log episode ${entry.episode.number}`,
          selectedProviders,
        )}
        description={`Log episode ${entry.episode.number} of “${entry.item.title}”.`}
        item={entry.item}
        logMedia={logMedia}
        manualTargets={manualTargets}
        onClose={() => setOpen(false)}
        onConfirm={confirmLog}
        onSelectedProvidersChange={setSelectedProviders}
        onTagsChange={setTags}
        onWatchedAtChange={setWatchedAt}
        open={open}
        pendingLabel="Logging…"
        selectedProviders={selectedProviders}
        tags={tags}
        targets={targets}
        title={`Log episode ${entry.episode.number}`}
        watchedAt={watchedAt}
      />
    </View>
  );
}
