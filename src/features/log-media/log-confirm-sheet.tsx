import { Text } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useLogMedia } from './use-log-media';
import { WatchedAtField } from './watched-at-field';

/** Joins provider labels for "Writes to ..." and outcome copy in both sheets. */
export function labels(ids: readonly ProviderId[]): string {
  return ids.map((id) => PROVIDERS[id].label).join(', ');
}

/**
 * The shared confirm/backdate sheet behind every log action (plan 0010
 * extracts this from the movie `LogMediaButton`). It shows the write targets,
 * a backdate field, per-provider partial failure (kept in context rather than
 * flashed after close), and the confirm/cancel pair. The parent owns the
 * `useLogMedia` mutation (so the season picker and the sheet share one), the
 * `watchedAt` state, and the confirm handler that fills `LogMediaVariables`.
 */
export interface LogConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  targets: readonly ProviderId[];
  /** The single shared `useLogMedia` mutation — sheet reads state, parent fires it. */
  logMedia: ReturnType<typeof useLogMedia>;
  watchedAt: Date | null;
  onWatchedAtChange: (value: Date | null) => void;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: () => void;
}

export function LogConfirmSheet({
  open,
  onClose,
  title,
  description,
  targets,
  logMedia,
  watchedAt,
  onWatchedAtChange,
  confirmLabel,
  pendingLabel,
  onConfirm,
}: LogConfirmSheetProps) {
  const result = logMedia.data;

  return (
    <Sheet onClose={onClose} open={open}>
      <Text className="text-2xl font-display text-foreground">{title}</Text>
      <Text className="text-muted font-sans text-sm mt-2 leading-relaxed">
        {description}
      </Text>
      <Text className="text-foreground font-sans text-sm mt-4">
        Writes to <Text className="font-sans-semibold">{labels(targets)}</Text>
      </Text>
      <WatchedAtField onChange={onWatchedAtChange} value={watchedAt} />
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
        onPress={onConfirm}
      >
        <Text className="text-accent-foreground font-sans-semibold text-base text-center">
          {logMedia.isPending ? pendingLabel : confirmLabel}
        </Text>
      </PresstableOpacity>
      <PresstableOpacity
        className="rounded px-5 py-3 mt-2 border border-border"
        onPress={onClose}
      >
        <Text className="text-foreground font-sans-semibold text-base text-center">
          Cancel
        </Text>
      </PresstableOpacity>
    </Sheet>
  );
}