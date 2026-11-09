import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { PresstableOpacity } from '@/components/presstable';
import { NativePickerMenu } from '@/components/native-picker-menu';
import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';
import {
  ANIME_SEASONS,
  MIN_ANIME_YEAR,
  maxAnimeYear,
  type AnimeSeason,
  type AnimeSeasonWindow,
} from '@/lib/providers/anilist/season';

import { NativeSegmentedControl } from '@/components/native-segmented-control';
import { YearSheet } from './year-sheet';

/** "WINTER" → "Winter". */
function seasonName(season: AnimeSeason): string {
  return season.charAt(0) + season.slice(1).toLowerCase();
}

const SEASON_OPTIONS = ANIME_SEASONS.map((season) => ({
  value: season,
  label: seasonName(season),
}));

/**
 * The explorer's year, for the screen header: ‹ › step one year, and the year
 * itself opens the year picker.
 */
export function YearStepper({
  window,
  onChange,
  className,
}: {
  window: AnimeSeasonWindow;
  onChange: (next: AnimeSeasonWindow) => void;
  /** Layout only. */
  className?: string;
}) {
  const foreground = useThemeColor('--color-foreground');
  const muted = useThemeColor('--color-muted');
  const [sheetOpen, setSheetOpen] = useState(false);
  const maxYear = maxAnimeYear(new Date());
  const tint = (enabled: boolean) => (enabled ? foreground : muted);
  const canGoBack = window.year > MIN_ANIME_YEAR;
  const canGoForward = window.year < maxYear;

  return (
    <View className={cn('flex-row items-center', className)}>
      <PresstableOpacity
        accessibilityLabel="Previous year"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canGoBack }}
        className="size-11 items-center justify-center rounded-full"
        disabled={!canGoBack}
        onPress={() => onChange({ ...window, year: window.year - 1 })}
      >
        <Ionicons color={tint(canGoBack)} name="chevron-back" size={20} />
      </PresstableOpacity>
      <NativePickerMenu
        onSelect={(year) => onChange({ ...window, year })}
        options={Array.from({ length: maxYear - MIN_ANIME_YEAR + 1 }, (_, index) => ({
          value: maxYear - index,
          label: String(maxYear - index),
        }))}
        title="Jump to year"
        value={window.year}
      >
        <PresstableOpacity
          accessibilityHint="Opens a list of years"
          accessibilityLabel={`Year: ${window.year}`}
          accessibilityRole="button"
          className="h-11 flex-row items-center gap-1 px-2 rounded-full"
          onPress={() => setSheetOpen(true)}
        >
          <Text className="text-xl font-display text-foreground">{window.year}</Text>
          <Ionicons color={tint(false)} name="chevron-down" size={14} />
        </PresstableOpacity>
      </NativePickerMenu>
      <PresstableOpacity
        accessibilityLabel="Next year"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canGoForward }}
        className="size-11 items-center justify-center rounded-full"
        disabled={!canGoForward}
        onPress={() => onChange({ ...window, year: window.year + 1 })}
      >
        <Ionicons color={tint(canGoForward)} name="chevron-forward" size={20} />
      </PresstableOpacity>
      {Platform.OS === 'web' && (
        <YearSheet
          max={maxYear}
          min={MIN_ANIME_YEAR}
          onClose={() => setSheetOpen(false)}
          onSelect={(year) => {
            setSheetOpen(false);
            onChange({ ...window, year });
          }}
          open={sheetOpen}
          value={window.year}
        />
      )}
    </View>
  );
}

/** The four cours. Every format is cour-scoped, films included, so it is unconditional. */
export function SeasonStrip({
  window,
  onChange,
  progress,
  className,
}: {
  window: AnimeSeasonWindow;
  onChange: (next: AnimeSeasonWindow) => void;
  /** The pager's position for the web season indicator. */
  progress: SharedValue<number>;
  /** Layout only. */
  className?: string;
}) {
  return (
    <NativeSegmentedControl
      accessibilityLabel="Season"
      className={className}
      onChange={(season) => onChange({ ...window, season })}
      options={SEASON_OPTIONS}
      progress={progress}
      value={window.season}
    />
  );
}
