import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useState } from 'react';

import { AnimatedView } from '@/components/animated-view';
import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useThemeColor } from '@/lib/theme-color';
import { useConnectedProviders } from '@/state/session';

/**
 * The one provider picker every write verb confirms through (plan 0032 R2,
 * KTD-1) — extracted from `LogConfirmSheet`, not written a second time. The
 * non-obvious content is the rules, not the layout: manual rows never render
 * here (they are `ManualWriteRows`, never a toggle), and nothing in this file
 * may affect a caller's `canConfirm` beyond the selected set it reports.
 */

const SELECTION_FADE = {
  transitionProperty: 'opacity',
  transitionDuration: DURATION.color,
  transitionTimingFunction: EASE_OUT,
} as const;

interface ProviderToggleProps {
  id: ProviderId;
  selected: boolean;
  onToggle: () => void;
}

function ProviderToggle({
  id, selected, onToggle,
}: ProviderToggleProps) {
  const accent = useThemeColor('--color-accent');
  const muted = useThemeColor('--color-muted');
  const descriptor = PROVIDERS[id];

  return (
    <PresstableOpacity
      accessibilityLabel={`Write to ${descriptor.label}`}
      accessibilityRole="button"
      // No accessibilityRole="checkbox" here: RNGH's web NativeViewGestureHandler
      // only fires presses on elements whose DOM role is "button", so any other
      // role on a pressto pressable silently kills onPress on web
      // (docs/solutions/web-pressto-accessibility-role-kills-onpress.md).
      accessibilityState={{ checked: selected }}
      aria-pressed={selected}
      className="min-h-11 flex-row items-center justify-between px-4 py-3"
      onPress={onToggle}
    >
      <AnimatedView
        className="absolute inset-0 bg-accent/10"
        style={[SELECTION_FADE, { opacity: selected ? 1 : 0 }]}
      />
      <View className="flex-row items-center gap-3">
        <ProviderIcon id={id} size={18} />
        <Text className="text-foreground font-sans-semibold text-sm">
          {descriptor.label}
        </Text>
      </View>
      <View>
        <Ionicons color={muted} name="ellipse-outline" size={20} />
        <AnimatedView
          className="absolute inset-0"
          style={[SELECTION_FADE, { opacity: selected ? 1 : 0 }]}
        >
          <Ionicons color={accent} name="checkmark-circle" size={20} />
        </AnimatedView>
      </View>
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
 * What the collapsible picker shows instead of an empty dropdown when no
 * connected provider can write the item: the reason, and the way out. The
 * caller owns `onConnect` because reaching the Connect tab means closing the
 * sheet the picker sits in first.
 */
function NoTargets({ onConnect }: { onConnect?: () => void }) {
  const connected = useConnectedProviders();
  const accent = useThemeColor('--color-accent');
  return (
    <View className="rounded-full border border-border bg-surface px-4 py-3 flex-row items-center justify-between gap-3">
      <Text className="text-muted font-sans text-sm flex-1" numberOfLines={2}>
        {connected.length === 0
          ? 'No trackers connected yet.'
          : 'None of your connected trackers can log this.'}
      </Text>
      {onConnect != null && (
        <PresstableOpacity
          accessibilityRole="button"
          className="flex-row items-center gap-1"
          onPress={onConnect}
        >
          <Text className="text-accent font-sans-semibold text-sm">Connect one</Text>
          <Ionicons color={accent} name="arrow-forward" size={14} />
        </PresstableOpacity>
      )}
    </View>
  );
}

/**
 * All/None and writable targets, shared by the collapsible log picker and
 * the standalone watchlist surface (plan 0032 R1).
 */
function ProviderOptions({
  targets,
  selectedProviders,
  onSelectAll,
  onSelectNone,
  onToggle,
}: ProviderPickerProps) {
  return (
    <View>
      {targets.length > 1 && (
        <View className="flex-row justify-end gap-3 px-4 py-2 border-b border-border">
          <PresstableOpacity onPress={onSelectAll}>
            <Text className="text-foreground font-sans-semibold text-xs">All</Text>
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

/** Standalone selection surface for the watchlist sheet. */
export function ProviderToggleList(props: ProviderPickerProps) {
  return (
    <View className="rounded-3xl border border-border bg-surface overflow-hidden">
      <ProviderOptions {...props} />
    </View>
  );
}

/**
 * The collapsible form of the picker — a summary row (selected providers'
 * icons + labels) sharing one clipped surface with its options. The log sheet
 * also carries a backdate field and tags, so the picker earns its keep collapsed.
 */
export function ProviderPicker({
  onConnect,
  ...props
}: ProviderPickerProps & { onConnect?: () => void }) {
  const { targets, selectedProviders } = props;
  const [expanded, setExpanded] = useState(false);
  if (targets.length === 0) return <NoTargets onConnect={onConnect} />;
  const selected = targets.filter((id) => selectedProviders.includes(id));
  const selectionLabel =
    selected.length === 0
      ? 'Select at least one provider to log.'
      : selected.map((id) => PROVIDERS[id].label).join(', ');

  return (
    <View className="rounded-3xl border border-border bg-surface overflow-hidden">
      <PresstableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        className="flex-row items-center justify-between px-4 py-3"
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
            className={cn(
              'text-sm flex-1',
              selected.length === 0
                ? 'font-sans text-accent-on-tonal'
                : 'font-sans-semibold text-foreground',
            )}
            numberOfLines={1}
          >
            {selectionLabel}
          </Text>
        </View>
        <DisclosureChevron open={expanded} size={18} />
      </PresstableOpacity>
      {expanded && (
        <View className="border-t border-border">
          <ProviderOptions {...props} />
        </View>
      )}
    </View>
  );
}
