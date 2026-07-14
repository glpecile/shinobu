import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useState } from 'react';
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
  const muted = useCSSVariable('--color-muted');
  const accentColor = typeof accent === 'string' ? accent : undefined;
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  const descriptor = PROVIDERS[id];

  return (
    <PresstableOpacity
      accessibilityLabel={`Log to ${descriptor.label}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      className={`flex-row items-center justify-between px-3 py-2.5 rounded-md ${
        selected ? 'bg-accent/10' : 'bg-surface'
      }`}
      onPress={onToggle}
    >
      <View className="flex-row items-center gap-3">
        <ProviderIcon id={id} size={18} />
        <Text className="text-foreground font-sans-semibold text-sm">
          {descriptor.label}
        </Text>
      </View>
      <Ionicons
        color={selected ? accentColor : mutedColor}
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
      />
    </PresstableOpacity>
  );
}

function ProviderPicker({
  targets,
  selectedProviders,
  onSelectAll,
  onSelectNone,
  onToggle,
}: {
  targets: readonly ProviderId[];
  selectedProviders: readonly ProviderId[];
  onSelectAll: () => void;
  onSelectNone: () => void;
  onToggle: (id: ProviderId) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  const selected = targets.filter((id) => selectedProviders.includes(id));
  const selectionLabel =
    selected.length === 0
      ? 'Choose providers'
      : selected.map((id) => PROVIDERS[id].label).join(', ');

  return (
    <View>
      <PresstableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className={`flex-row items-center justify-between rounded-lg border px-4 py-3 ${
          expanded ? 'border-accent bg-accent/5' : 'border-border bg-surface'
        }`}
        onPress={() => setExpanded(!expanded)}
      >
        <View className="flex-row items-center gap-2 flex-1 mr-3">
          {selected.length > 0 && (
            <View className="flex-row items-center gap-1">
              {selected.map((id) => (
                <ProviderIcon id={id} key={id} size={16} />
              ))}
            </View>
          )}
          <Text
            className="text-foreground font-sans-semibold text-sm flex-1"
            numberOfLines={1}
          >
            {selectionLabel}
          </Text>
        </View>
        <Ionicons
          color={mutedColor}
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
        />
      </PresstableOpacity>
      {expanded && (
        <View className="mt-2 rounded-lg border border-border bg-background p-1">
          {targets.length > 1 && (
            <View className="flex-row justify-end gap-3 px-3 py-2 border-b border-border">
              <PresstableOpacity onPress={onSelectAll}>
                <Text className="text-accent font-sans-semibold text-xs">All</Text>
              </PresstableOpacity>
              <PresstableOpacity
                accessibilityLabel="Select no providers"
                onPress={onSelectNone}
              >
                <Text className="text-muted font-sans-semibold text-xs">None</Text>
              </PresstableOpacity>
            </View>
          )}
          {targets.map((id) => (
            <ProviderToggle
              id={id}
              key={id}
              onToggle={() => onToggle(id)}
              selected={selectedProviders.includes(id)}
            />
          ))}
        </View>
      )}
    </View>
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
    onSelectedProvidersChange(
      selectedProviders.includes(id)
        ? selectedProviders.filter((provider) => provider !== id)
        : [...selectedProviders, id],
    );
  }

  function selectAllProviders() {
    onSelectedProvidersChange([...targets]);
  }

  function selectNoProviders() {
    onSelectedProvidersChange([]);
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
      <ProviderPicker
        onSelectAll={selectAllProviders}
        onSelectNone={selectNoProviders}
        onToggle={toggleProvider}
        selectedProviders={selectedProviders}
        targets={targets}
      />
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
