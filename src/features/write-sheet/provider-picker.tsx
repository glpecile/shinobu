import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useState } from 'react';

import { AnimatedView } from '@/components/animated-view';
import { DisclosureChevron } from '@/components/disclosure-chevron';
import { MorphText } from '@/components/morph-text';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useThemeColor } from '@/lib/theme-color';
import { useConnectedProviders } from '@/state/session';

const SELECTION_FADE = {
  transitionProperty: 'opacity',
  transitionDuration: DURATION.color,
  transitionTimingFunction: EASE_OUT,
} as const;

interface ProviderToggleProps {
  id: ProviderId;
  selected: boolean;
  onToggle: () => void;
  detail?: string;
}

function ProviderToggle({
  id, selected, onToggle, detail,
}: ProviderToggleProps) {
  const accent = useThemeColor('--color-accent');
  const muted = useThemeColor('--color-muted');
  const descriptor = PROVIDERS[id];

  return (
    <PresstableOpacity
      accessibilityLabel={detail == null ? `Write to ${descriptor.label}` : `Write to ${descriptor.label}, ${detail}`}
      accessibilityRole="button"
      accessibilityState={{ checked: selected }}
      aria-pressed={selected}
      className="min-h-11 flex-row items-center justify-between px-4 py-3"
      onPress={onToggle}
    >
      <AnimatedView
        className="absolute inset-0 bg-accent-tonal"
        style={[SELECTION_FADE, { opacity: selected ? 1 : 0 }]}
      />
      <View className="flex-row items-center gap-3">
        <ProviderIcon id={id} size={18} />
        <Text className="text-foreground font-sans-semibold text-sm">
          {descriptor.label}
        </Text>
        {detail != null && <Text className="text-muted font-sans text-sm">{detail}</Text>}
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
  details?: Partial<Record<ProviderId, string>>;
  selectedProviders: readonly ProviderId[];
  onSelectAll: () => void;
  onSelectNone: () => void;
  onToggle: (id: ProviderId) => void;
}

function NoTargets({ onConnect }: { onConnect?: () => void }) {
  const connected = useConnectedProviders();
  const accent = useThemeColor('--color-accent');
  return (
    <View className="rounded-3xl border border-border bg-surface px-4 py-3 flex-row items-center justify-between gap-3">
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

function ProviderOptions({
  targets,
  details,
  selectedProviders,
  onSelectAll,
  onSelectNone,
  onToggle,
}: ProviderPickerProps) {
  const allSelected = targets.every((id) => selectedProviders.includes(id));
  const anySelected = targets.some((id) => selectedProviders.includes(id));
  return (
    <View>
      {targets.length > 1 && (
        <View className="flex-row justify-end gap-3 px-4 border-b border-border">
          <PresstableOpacity
            accessibilityLabel="Select all providers"
            accessibilityRole="button"
            className="min-h-11 justify-center"
            onPress={() => {
              if (!allSelected) haptics.selection();
              onSelectAll();
            }}
          >
            <Text className="text-foreground font-sans-semibold text-xs">All</Text>
          </PresstableOpacity>
          <PresstableOpacity
            accessibilityLabel="Select no providers"
            accessibilityRole="button"
            className="min-h-11 justify-center"
            onPress={() => {
              if (anySelected) haptics.selection();
              onSelectNone();
            }}
          >
            <Text className="text-muted font-sans-semibold text-xs">None</Text>
          </PresstableOpacity>
        </View>
      )}
      {targets.map((id) => (
        <ProviderToggle
          detail={details?.[id]}
          id={id}
          key={id}
          onToggle={() => {
            haptics.selection();
            onToggle(id);
          }}
          selected={selectedProviders.includes(id)}
        />
      ))}
    </View>
  );
}

export function ProviderToggleList(props: ProviderPickerProps) {
  return (
    <View className="rounded-3xl border border-border bg-surface overflow-hidden">
      <ProviderOptions {...props} />
    </View>
  );
}

export function ProviderPicker({
  onConnect,
  ...props
}: ProviderPickerProps & { onConnect?: () => void }) {
  const { targets, selectedProviders } = props;
  const [expanded, setExpanded] = useState(false);
  const guidanceColor = useThemeColor('--color-accent-on-tonal');
  if (targets.length === 0) return <NoTargets onConnect={onConnect} />;
  const selected = targets.filter((id) => selectedProviders.includes(id));
  const selectionLabel =
    selected.length === 0
      ? 'Select at least one provider to log.'
      : selected.map((id) => PROVIDERS[id].label).join(', ');

  return (
    <View className="rounded-3xl border border-border bg-surface overflow-hidden">
      <PresstableOpacity
        accessibilityLabel={selectionLabel}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        className="flex-row items-center justify-between px-4 py-3"
        onPress={() => setExpanded(!expanded)}
        pressBehavior="immediate"
      >
        <View className="flex-row items-center gap-2 flex-1 mr-3">
          {selected.length === 0 && (
            <Ionicons
              accessibilityElementsHidden
              importantForAccessibility="no"
              color={guidanceColor}
              name="alert-circle-outline"
              size={16}
            />
          )}
          {selected.length > 0 && (
            <View className="flex-row items-center gap-1">
              {selected.map((id) => (
                <ProviderIcon id={id} key={id} size={16} />
              ))}
            </View>
          )}
          <View className="flex-1 min-w-0 flex-row overflow-hidden">
            <MorphText
              className={cn(
                'text-sm',
                selected.length === 0
                  ? 'font-sans text-accent-on-tonal'
                  : 'font-sans-semibold text-foreground',
              )}
            >
              {selectionLabel}
            </MorphText>
          </View>
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
