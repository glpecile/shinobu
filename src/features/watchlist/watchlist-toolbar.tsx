import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { Sheet } from '@/components/sheet';
import { PROVIDER_DOT } from '@/features/trackers/provider-style';
import { cn } from '@/lib/cn';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

import {
  formatWatchlistCount,
  watchlistFilterOptions,
  watchlistTotal,
} from './filter';
import type { WatchlistEntry } from './types';
import { setWatchlistView, type WatchlistView } from '@/state/prefs/watchlist-view';

/**
 * `/watchlist`'s one line of chrome (owner, 2026-08-01 — direction B of three
 * prototyped): a filter control on the left naming the tracker in words, and a
 * grid/list toggle on the right. **Fixed height whatever the provider count**,
 * which is what it was chosen for — a chip-per-provider rail grows with the
 * registry and scrolls out of reach on a phone at five trackers.
 *
 * The active state is inverted (foreground fill), **not** the accent. Crimson
 * was the first pass and was wrong twice over: the label already changes from
 * "All trackers" to the tracker's name, so the colour was restating state, and
 * the accent means "this is the action" everywhere else in the app — on a
 * surface whose actual action is the poster you tap next. Inverting also spends
 * no hue at all, so nothing competes with the provider dots on the artwork
 * below it.
 */

/** Filtered → the control carries its own way out, so clearing is one tap. */
function FilterPill({
  active,
  onOpen,
  onClear,
}: {
  active: ProviderId | null;
  onOpen: () => void;
  onClear: () => void;
}) {
  const background = useCSSVariable('--color-background');
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;

  if (active == null) {
    return (
      <PresstableOpacity
        accessibilityHint="Choose which tracker's watchlist to show"
        accessibilityLabel="Filter: all trackers"
        accessibilityRole="button"
        className="flex-row items-center gap-2 rounded-full border border-border px-3 py-1.5"
        onPress={onOpen}
      >
        <Ionicons color={mutedColor} name="funnel-outline" size={13} />
        <Text className="text-foreground font-sans text-sm">All trackers</Text>
        <Ionicons color={mutedColor} name="chevron-down" size={11} />
      </PresstableOpacity>
    );
  }

  // Two sibling pressables inside one bordered shell, never nested: a
  // gesture-handler button inside another lets the ✕ press bubble into the
  // one that opens the sheet (the same rule the poster wall's ⋯ follows).
  return (
    <View className="flex-row items-center rounded-full bg-foreground">
      <PresstableOpacity
        accessibilityHint="Choose a different tracker"
        accessibilityLabel={`Filter: ${PROVIDERS[active].label}`}
        accessibilityRole="button"
        className="flex-row items-center gap-2 pl-3 pr-2 py-1.5"
        onPress={onOpen}
      >
        <View className={cn('w-2 h-2 rounded-full', PROVIDER_DOT[active])} />
        <Text className="text-background font-sans-semibold text-sm">
          {PROVIDERS[active].label}
        </Text>
      </PresstableOpacity>
      <PresstableOpacity
        accessibilityLabel="Show all trackers"
        accessibilityRole="button"
        className="pl-1 pr-2.5 py-1.5"
        onPress={onClear}
      >
        <Ionicons
          color={typeof background === 'string' ? background : undefined}
          name="close"
          size={14}
        />
      </PresstableOpacity>
    </View>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: WatchlistView;
  onChange: (view: WatchlistView) => void;
}) {
  const foreground = useCSSVariable('--color-foreground');
  const muted = useCSSVariable('--color-muted');
  const tint = (on: boolean) => {
    const color = on ? foreground : muted;
    return typeof color === 'string' ? color : undefined;
  };

  return (
    <View className="flex-row rounded-md border border-border overflow-hidden">
      {(
        [
          { id: 'grid', icon: 'grid', label: 'Poster grid' },
          { id: 'list', icon: 'list', label: 'List' },
        ] as const
      ).map(({ id, icon, label }) => (
        <PresstableOpacity
          accessibilityLabel={label}
          accessibilityRole="button"
          accessibilityState={{ selected: view === id }}
          className={cn('w-9 h-7 items-center justify-center', view === id && 'bg-surface')}
          key={id}
          onPress={() => onChange(id)}
        >
          <Ionicons color={tint(view === id)} name={icon} size={15} />
        </PresstableOpacity>
      ))}
    </View>
  );
}

/** One option row in the picker. `count` is 0 only for a deep-linked filter
 *  whose leg failed this gather — see `watchlistFilterOptions`. */
function FilterOption({
  provider,
  count,
  partial,
  selected,
  onSelect,
}: {
  provider: ProviderId | null;
  count: number;
  /** Renders `46+` — the leg has pages it hasn't read. */
  partial: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const accent = useCSSVariable('--color-accent');
  const label = provider == null ? 'All trackers' : PROVIDERS[provider].label;
  return (
    <PresstableOpacity
      // The `+` is punctuation a screen reader drops or reads as "plus", so
      // the row spells the claim out — the whole point of the glyph is that
      // the number is a floor.
      accessibilityLabel={`${label}, ${count}${partial ? ' or more' : ''}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-row items-center gap-3 py-3"
      onPress={onSelect}
    >
      <View className="w-4">
        {selected && (
          <Ionicons
            color={typeof accent === 'string' ? accent : undefined}
            name="checkmark"
            size={16}
          />
        )}
      </View>
      {provider != null && <ProviderIcon id={provider} size={18} />}
      <Text className="text-foreground font-sans text-base flex-1">{label}</Text>
      <Text className="text-muted font-sans text-sm">
        {formatWatchlistCount(count, partial)}
      </Text>
    </PresstableOpacity>
  );
}

export interface WatchlistToolbarProps {
  /** The **unfiltered** entries — the option counts describe the whole list. */
  entries: readonly WatchlistEntry[];
  /**
   * Legs that succeeded but haven't read every page. Their counts render as a
   * floor (`46+`) rather than a total the app can't stand behind.
   */
  incomplete: readonly ProviderId[];
  provider: ProviderId | null;
  onProviderChange: (provider: ProviderId | null) => void;
  view: WatchlistView;
}

export function WatchlistToolbar({
  entries,
  incomplete,
  provider,
  onProviderChange,
  view,
}: WatchlistToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const options = watchlistFilterOptions(entries, provider, incomplete);
  const total = watchlistTotal(entries, incomplete);

  function select(next: ProviderId | null) {
    setPickerOpen(false);
    onProviderChange(next);
  }

  return (
    <View className="flex-row items-center gap-3 px-6 pb-3">
      <FilterPill
        active={provider}
        onClear={() => onProviderChange(null)}
        onOpen={() => setPickerOpen(true)}
      />
      <View className="flex-1" />
      <ViewToggle onChange={setWatchlistView} view={view} />
      <Sheet onClose={() => setPickerOpen(false)} open={pickerOpen}>
        <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-1">
          Show titles from
        </Text>
        <FilterOption
          count={total.count}
          onSelect={() => select(null)}
          partial={total.partial}
          provider={null}
          selected={provider == null}
        />
        {options.map((option) => (
          <FilterOption
            count={option.count}
            key={option.provider}
            onSelect={() => select(option.provider)}
            partial={option.partial}
            provider={option.provider}
            selected={provider === option.provider}
          />
        ))}
      </Sheet>
    </View>
  );
}
