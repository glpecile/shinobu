import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { PickerSheet } from '@/components/picker-sheet';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { ViewToggle } from '@/components/view-toggle';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useThemeColor } from '@/lib/theme-color';

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
  const background = useThemeColor('--color-background');

  if (active == null) {
    return (
      <Button
        accessibilityLabel="Filter: all trackers"
        icon={<Button.Icon name="filter-outline" />}
        label="All trackers"
        onPress={onOpen}
        shape="pill"
        size="sm"
        trailingIcon={<Button.Icon name="chevron-down" />}
        variant="quiet"
      />
    );
  }

  // Two sibling pressables inside one bordered shell, never nested: a
  // gesture-handler button inside another lets the ✕ press bubble into the
  // one that opens the sheet (the same rule the poster wall's ⋯ follows).
  // The same-colour border matches the idle `Button`'s height.
  return (
    <View className="flex-row items-center rounded-full bg-foreground border border-foreground">
      <PresstableOpacity
        accessibilityHint="Choose a different tracker"
        accessibilityLabel={`Filter: ${PROVIDERS[active].label}`}
        accessibilityRole="button"
        className="flex-row items-center gap-2 pl-3 pr-2 py-2"
        onPress={onOpen}
      >
        <ProviderIcon id={active} size={14} />
        <Text className="text-background font-sans-semibold text-sm">
          {PROVIDERS[active].label}
        </Text>
      </PresstableOpacity>
      <PresstableOpacity
        accessibilityLabel="Show all trackers"
        accessibilityRole="button"
        className="pl-1 pr-2.5 py-2"
        onPress={onClear}
      >
        <Ionicons
          color={background}
          name="close"
          size={14}
        />
      </PresstableOpacity>
    </View>
  );
}

/** `count` is 0 only for a deep-linked filter whose leg failed this gather —
 *  see `watchlistFilterOptions`. `partial` renders `46+`: the leg has pages it
 *  hasn't read. */
function FilterOption({
  provider,
  count,
  partial,
}: {
  provider: ProviderId | null;
  count: number;
  partial: boolean;
}) {
  const label = provider == null ? 'All trackers' : PROVIDERS[provider].label;
  return (
    <PickerSheet.Option
      // The `+` is punctuation a screen reader drops or reads as "plus", so
      // the row spells the claim out — the whole point of the glyph is that
      // the number is a floor.
      accessibilityLabel={`${label}, ${count}${partial ? ' or more' : ''}`}
      count={formatWatchlistCount(count, partial)}
      icon={provider == null ? undefined : <ProviderIcon id={provider} size={18} />}
      label={label}
      value={provider}
    />
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

  return (
    <View className="flex-row items-center gap-3 px-6 pb-3">
      <FilterPill
        active={provider}
        onClear={() => onProviderChange(null)}
        onOpen={() => setPickerOpen(true)}
      />
      <View className="flex-1" />
      <ViewToggle onChange={setWatchlistView} view={view} />
      <PickerSheet
        onClose={() => setPickerOpen(false)}
        onSelect={onProviderChange}
        open={pickerOpen}
        title="Show titles from"
        value={provider}
      >
        <FilterOption {...total} provider={null} />
        {options.map((option) => (
          <FilterOption {...option} key={option.provider} />
        ))}
      </PickerSheet>
    </View>
  );
}
