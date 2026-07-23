import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableScale } from '@/components/presstable';
import { useLogMedia } from '@/features/log-media/use-log-media';
import type { UpNextEntry } from '@/features/up-next/types';
import { haptics } from '@/lib/haptics';
import { useUpNextSettling } from '@/state/queries/up-next';

import {
  isQuickLogPending,
  resolveQuickLog,
  settleTransition,
  type QuickLogPhase,
} from './quick-log-state';

/**
 * The Continue Watching checkmark: one tap logs *this* episode through the
 * shared `useLogMedia` fan-out — never a single-provider write (R7).
 *
 * Nothing advances optimistically (KTD-6). The button holds a pending state
 * from the write until the invalidated Up Next slot settles; the card then
 * advances, moves to Calendar, or disappears purely from recomputed data,
 * which is also why a card that advances simply unmounts (its entry id carries
 * the episode number) instead of animating a local counter.
 *
 * One tap is deliberate here — it copies the reference behavior and pressto's
 * leading-edge debounce guards the double tap — and knowingly deviates from
 * the confirm sheet every other log entry point opens.
 */
const SETTLE_TIMEOUT_MS = 10_000;

export function QuickLogButton({ entry }: { entry: UpNextEntry }) {
  const logMedia = useLogMedia();
  const fetching = useUpNextSettling();
  const [phase, setPhase] = useState<QuickLogPhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const sawFetch = useRef(false);
  const [timedOut, setTimedOut] = useState(false);
  const accentForeground = useCSSVariable('--color-accent-foreground');
  const iconColor =
    typeof accentForeground === 'string' ? accentForeground : undefined;

  // The settle watcher: `invalidateAfterLog` is fire-and-forget, so this is
  // how the button notices the refetch it caused — and how it stops waiting
  // for one that never lands.
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

  function log() {
    if (pending) return;
    haptics.confirm();
    setPhase('logging');
    setNotice(null);
    setTimedOut(false);
    sawFetch.current = false;
    logMedia.mutate(
      {
        item: entry.item,
        episodes: [{ season: entry.episode.season, number: entry.episode.number }],
      },
      {
        onSuccess: (outcome) => {
          const resolved = resolveQuickLog(outcome, entry.source);
          setPhase(resolved.phase);
          setNotice(resolved.notice);
          if (resolved.phase === 'failed') haptics.error();
          else haptics.success();
        },
        onError: (error: Error) => {
          haptics.error();
          setPhase('failed');
          setNotice(error.message);
        },
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
          phase === 'failed' || phase === 'settle-failed'
            ? 'bg-surface border border-accent'
            : 'bg-accent'
        }`}
        onPress={log}
      >
        {pending ? (
          <ActivityIndicator color={iconColor} size="small" />
        ) : (
          <Ionicons
            color={iconColor}
            name={
              phase === 'failed' || phase === 'settle-failed'
                ? 'refresh'
                : 'checkmark'
            }
            size={18}
          />
        )}
      </PresstableScale>
      {phase === 'settle-failed' && (
        <Text className="text-muted font-sans text-xs mt-1 text-right">
          Logged — refresh to update.
        </Text>
      )}
      {notice != null && (
        <Text className="text-accent font-sans text-xs mt-1 text-right">
          {notice}
        </Text>
      )}
    </View>
  );
}
