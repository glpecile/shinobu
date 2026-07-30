import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useState } from 'react';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { cn } from '@/lib/cn';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

/**
 * The one provider picker every write verb confirms through (plan 0032 R2,
 * KTD-1) — extracted from `LogConfirmSheet`, not written a second time. The
 * non-obvious content is the rules, not the layout: manual rows never render
 * here (they are `ManualWriteRows`, never a toggle), and nothing in this file
 * may affect a caller's `canConfirm` beyond the selected set it reports.
 */

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
      accessibilityLabel={`Write to ${descriptor.label}`}
      // No accessibilityRole="checkbox" here: RNGH's web NativeViewGestureHandler
      // only fires presses on elements whose DOM role is "button", so any other
      // role on a pressto pressable silently kills onPress on web
      // (docs/solutions/web-pressto-accessibility-role-kills-onpress.md).
      accessibilityState={{ checked: selected }}
      className={cn(
        'flex-row items-center justify-between px-3 py-2.5 rounded-md',
        selected ? 'bg-accent/10' : 'bg-surface',
      )}
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

export interface ProviderPickerProps {
  targets: readonly ProviderId[];
  selectedProviders: readonly ProviderId[];
  onSelectAll: () => void;
  onSelectNone: () => void;
  onToggle: (id: ProviderId) => void;
}

/**
 * The expanded toggle list — All/None header plus one toggle per writable
 * target. `ProviderPicker` below wraps it in the log sheet's collapsible
 * summary chrome; the watchlist picker sheet renders it directly, because
 * choosing targets *is* that sheet's whole content and a collapsed dropdown
 * would hide it (plan 0032 R1: "a sheet listing its applicable connected
 * providers").
 */
export function ProviderToggleList({
  targets,
  selectedProviders,
  onSelectAll,
  onSelectNone,
  onToggle,
}: ProviderPickerProps) {
  return (
    <View className="rounded-lg border border-border bg-background p-1">
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
  );
}

/**
 * The collapsible form of the picker — a summary row (selected providers'
 * icons + labels) that expands into `ProviderToggleList`. This is the
 * log sheet's shape, unchanged: that sheet also carries a backdate field and
 * tags, so the picker earns its keep collapsed.
 */
export function ProviderPicker(props: ProviderPickerProps) {
  const { targets, selectedProviders } = props;
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
        className={cn(
          'flex-row items-center justify-between rounded-lg border px-4 py-3',
          expanded ? 'border-accent bg-accent/5' : 'border-border bg-surface',
        )}
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
        <View className="mt-2">
          <ProviderToggleList {...props} />
        </View>
      )}
    </View>
  );
}
