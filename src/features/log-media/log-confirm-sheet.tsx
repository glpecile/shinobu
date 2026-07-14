import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { Sheet } from '@/components/sheet';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useLogMedia } from './use-log-media';
import { WatchedAtField } from './watched-at-field';

/** Joins provider labels for "Writes to ..." and outcome copy in both sheets. */
export function labels(ids: readonly ProviderId[]): string {
  return ids.map((id) => PROVIDERS[id].label).join(', ');
}

interface ProviderToggleProps {
  id: ProviderId;
  selected: boolean;
  onToggle: () => void;
}

function ProviderToggle({ id, selected, onToggle }: ProviderToggleProps) {
  const accent = useCSSVariable('--color-accent');
  const accentColor = typeof accent === 'string' ? accent : undefined;
  const descriptor = PROVIDERS[id];

  return (
    <PresstableOpacity
      className={`flex-row items-center justify-between px-4 py-3 rounded-lg border ${
        selected ? 'bg-accent/5 border-accent' : 'bg-surface border-border'
      }`}
      onPress={onToggle}
    >
      <View className="flex-row items-center gap-3">
        <ProviderIcon id={id} size={18} />
        <Text className="text-foreground font-sans-semibold text-sm">
          {descriptor.label}
        </Text>
      </View>
      <View
        className={`w-5 h-5 rounded border items-center justify-center ${
          selected ? 'bg-accent border-accent' : 'border-border'
        }`}
      >
        {selected && (
          <Ionicons color={accentColor} name="checkmark" size={14} />
        )}
      </View>
    </PresstableOpacity>
  );
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
  /** Which of `targets` are actually selected — defaults to all targets. */
  selectedProviders: ProviderId[];
  onSelectedProvidersChange: (ids: ProviderId[]) => void;
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
  selectedProviders,
  onSelectedProvidersChange,
  logMedia,
  watchedAt,
  onWatchedAtChange,
  confirmLabel,
  pendingLabel,
  onConfirm,
}: LogConfirmSheetProps) {
  const result = logMedia.data;

  function toggleProvider(id: ProviderId) {
    const next = selectedProviders.includes(id)
      ? selectedProviders.filter((provider) => provider !== id)
      : [...selectedProviders, id];
    onSelectedProvidersChange(next);
  }

  const canConfirm = selectedProviders.length > 0 && !logMedia.isPending;

  return (
    <Sheet onClose={onClose} open={open}>
      <Text className="text-2xl font-display text-foreground">{title}</Text>
      <Text className="text-muted font-sans text-sm mt-2 leading-relaxed">
        {description}
      </Text>

      <Text className="text-foreground font-sans-semibold text-sm mt-5 mb-2">
        Write to
      </Text>
      <View className="gap-2">
        {targets.map((id) => (
          <ProviderToggle
            id={id}
            key={id}
            onToggle={() => toggleProvider(id)}
            selected={selectedProviders.includes(id)}
          />
        ))}
      </View>
      {selectedProviders.length === 0 && (
        <Text className="text-accent font-sans text-sm mt-2">
          Select at least one provider to log.
        </Text>
      )}

      <WatchedAtField onChange={onWatchedAtChange} value={watchedAt} />
      {result != null && result.failed.length > 0 && (
        <Text className="text-accent font-sans text-sm mt-3">
          Failed on {labels(result.failed)}
          {result.succeeded.length > 0
            ? ` — ${labels(result.succeeded)} was logged.`
            : '.'}
        </Text>
      )}
      {result != null && result.skipped.length > 0 && (
        <Text className="text-muted font-sans text-sm mt-3">
          {labels(result.skipped)} already had this logged — skipped to keep
          both in sync.
        </Text>
      )}
      {logMedia.isError && (
        <Text className="text-accent font-sans text-sm mt-3">
          Could not log. Try again.
        </Text>
      )}
      <PresstableOpacity
        className={`rounded px-5 py-3 mt-6 ${
          canConfirm ? 'bg-accent' : 'bg-accent/40'
        }`}
        onPress={canConfirm ? onConfirm : undefined}
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
