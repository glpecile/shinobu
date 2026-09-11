import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { PresstableOpacity } from '@/components/presstable';
import { SegmentedControl } from '@/components/segmented-control';
import { useThemeColor } from '@/lib/theme-color';
import {
  ANIME_SEASONS,
  MIN_ANIME_YEAR,
  maxAnimeYear,
  type AnimeSeason,
  type AnimeSeasonWindow,
} from '@/lib/providers/anilist/season';

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
 * The seasons explorer's inputs: a year row (‹ › steps one year, the year
 * itself opens the jump sheet) over the four cours as a segmented control.
 * Every format is cour-scoped, films included, so the strip is unconditional.
 */
export function SeasonPicker({
  window,
  onChange,
  progress,
}: {
  window: AnimeSeasonWindow;
  onChange: (next: AnimeSeasonWindow) => void;
  /** The pager's position, so the cour pill rides the swipe. */
  progress: SharedValue<number>;
}) {
  const foreground = useThemeColor('--color-foreground');
  const muted = useThemeColor('--color-muted');
  const [sheetOpen, setSheetOpen] = useState(false);
  const maxYear = maxAnimeYear(new Date());
  const tint = (enabled: boolean) => (enabled ? foreground : muted);
  const canGoBack = window.year > MIN_ANIME_YEAR;
  const canGoForward = window.year < maxYear;

  return (
    <View className="px-4 pb-3 gap-3">
      <View className="flex-row items-center justify-center gap-1">
        <PresstableOpacity
          accessibilityLabel="Previous year"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoBack }}
          className="w-9 h-9 items-center justify-center rounded-full"
          disabled={!canGoBack}
          onPress={() => onChange({ ...window, year: window.year - 1 })}
        >
          <Ionicons color={tint(canGoBack)} name="chevron-back" size={20} />
        </PresstableOpacity>
        <PresstableOpacity
          accessibilityHint="Opens a list of years"
          accessibilityLabel={`Year: ${window.year}`}
          accessibilityRole="button"
          className="flex-row items-center gap-1 px-3 py-1 rounded-full"
          onPress={() => setSheetOpen(true)}
        >
          <Text className="text-xl font-display text-foreground">{window.year}</Text>
          <Ionicons color={tint(false)} name="chevron-down" size={14} />
        </PresstableOpacity>
        <PresstableOpacity
          accessibilityLabel="Next year"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoForward }}
          className="w-9 h-9 items-center justify-center rounded-full"
          disabled={!canGoForward}
          onPress={() => onChange({ ...window, year: window.year + 1 })}
        >
          <Ionicons color={tint(canGoForward)} name="chevron-forward" size={20} />
        </PresstableOpacity>
      </View>
      <SegmentedControl
        accessibilityLabel="Season"
        onChange={(season) => onChange({ ...window, season })}
        options={SEASON_OPTIONS}
        progress={progress}
        value={window.season}
      />
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
    </View>
  );
}
