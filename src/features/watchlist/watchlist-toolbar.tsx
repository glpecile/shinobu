import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState, type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { NativePickerMenu } from '@/components/native-picker-menu';
import { PickerSheet } from '@/components/picker-sheet';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { MediaToolbar } from '@/features/media-layout/media-toolbar';
import { MediaSortControl, SortingLoadedNotice } from '@/features/media-layout/media-sort-control';
import type { MediaSort } from '@/lib/media-sort';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useThemeColor } from '@/lib/theme-color';

import { formatWatchlistCount, watchlistFilterOptions, watchlistTotal } from './filter';
import type { WatchlistEntry } from './types';
import type { WatchlistView } from '@/state/prefs/watchlist-view';

function FilterPill({
  active,
  onOpen,
  onClear,
  options,
  onSelect,
}: {
  active: ProviderId | null;
  onOpen: () => void;
  onClear: () => void;
  options: readonly { value: ProviderId | null; label: string; icon?: ReactNode }[];
  onSelect: (value: ProviderId | null) => void;
}) {
  const foreground = useThemeColor('--color-foreground');

  if (active == null) {
    return (
      <NativePickerMenu
        onSelect={onSelect}
        options={options}
        title="Show titles from"
        value={active}
      >
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
      </NativePickerMenu>
    );
  }

  return (
    <View className="flex-row items-center rounded-full bg-surface border border-border">
      <NativePickerMenu
        onSelect={onSelect}
        options={options}
        title="Show titles from"
        value={active}
      >
        <PresstableOpacity
          accessibilityHint="Choose a different tracker"
          accessibilityLabel={`Filter: ${PROVIDERS[active].label}`}
          accessibilityRole="button"
          className="flex-row items-center gap-2 pl-3 pr-2 py-2"
          onPress={onOpen}
        >
          <ProviderIcon id={active} size={14} />
          <Text className="text-foreground font-sans-semibold text-sm">
            {PROVIDERS[active].label}
          </Text>
        </PresstableOpacity>
      </NativePickerMenu>
      <PresstableOpacity
        accessibilityLabel="Show all trackers"
        accessibilityRole="button"
        className="self-stretch justify-center pl-1 pr-2.5"
        hitSlop={{ top: 6, bottom: 6, right: 8 }}
        onPress={onClear}
      >
        <Ionicons color={foreground} name="close" size={14} />
      </PresstableOpacity>
    </View>
  );
}

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
  incomplete: readonly ProviderId[];
  provider: ProviderId | null;
  onProviderChange: (provider: ProviderId | null) => void;
  view: WatchlistView;
  sort: MediaSort;
}

export function WatchlistToolbar({
  entries,
  incomplete,
  provider,
  onProviderChange,
  view,
  sort,
}: WatchlistToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const options = watchlistFilterOptions(entries, provider, incomplete);
  const total = watchlistTotal(entries, incomplete);
  const partial = provider == null ? total.partial : incomplete.includes(provider);
  const menuOptions = [{ provider: null, ...total }, ...options].map((option) => ({
    value: option.provider,
    icon: option.provider == null ? undefined : <ProviderIcon id={option.provider} size={16} />,
    label: `${option.provider == null ? 'All trackers' : PROVIDERS[option.provider].label} (${option.count}${option.partial ? ' or more' : ''})`,
  }));

  return (
    <>
      <MediaToolbar
        notice={sort !== 'default' && partial ? <SortingLoadedNotice /> : undefined}
        view={view}
      >
        <FilterPill
          active={provider}
          onClear={() => onProviderChange(null)}
          onOpen={() => setPickerOpen(true)}
          onSelect={onProviderChange}
          options={menuOptions}
        />
        <MediaSortControl scope="watchlist" sort={sort} />
      </MediaToolbar>
      {Platform.OS === 'web' && (
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
      )}
    </>
  );
}
