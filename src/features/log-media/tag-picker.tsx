import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useDeferredValue, useState } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import { type EntryOrExitLayoutType, FadeIn, useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PresstableOpacity } from '@/components/presstable';
import { Skeleton } from '@/components/skeleton';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { DURATION, EASE_OUT } from '@/lib/motion';
import type { LetterboxdTag } from '@/lib/providers/letterboxd/tags';
import { useThemeColor } from '@/lib/theme-color';
import { useRecentTags } from '@/state/prefs/recent-tags';
import { useLetterboxdTagsQuery } from '@/state/queries/letterboxd';
import {
  activeTagFragment,
  filterTagSuggestions,
  isTagSelected,
  pinSelectedTags,
  toggleTag,
} from './parse-tags';

const MAX_SUGGESTIONS = 24;

const CHIP_STAGGER = 20;
const CHIP_STAGGER_STEPS = 5;

/**
 * Must stay a Reanimated preset (`FadeIn`), never a custom `Keyframe`: on web,
 * custom keyframes pin elements to `position: absolute` after cleanup
 * (docs/solutions/reanimated-web-keyframe-pins-position.md).
 */
const chipEntering = Array.from({ length: CHIP_STAGGER_STEPS }, (_, step) =>
  FadeIn.duration(DURATION.swap).delay(step * CHIP_STAGGER),
);

const chipFading = FadeIn.duration(DURATION.swap);

function chipAnimation(index: number, reduceMotion: boolean): EntryOrExitLayoutType {
  if (reduceMotion) return chipFading;
  return chipEntering[Math.min(index, CHIP_STAGGER_STEPS - 1)];
}

const ROW_EPSILON = 2;

/** Pre-measurement fallback height so the sheet opens clipped rather than at full expanded height (docs/solutions/sheet-scroller-swap-render-loop.md). */
const ESTIMATED_ROW_HEIGHT = 36;

const MAX_MEASURED_LISTS = 64;

function measureKey(suggestions: readonly string[]): string {
  return suggestions.join(',');
}

function useFilterFragment(fragment: string): string {
  const deferred = useDeferredValue(fragment);
  return fragment === '' ? '' : deferred;
}

function mergeTagSuggestions(
  letterboxdTags: readonly LetterboxdTag[],
  recentTags: readonly string[],
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const tag of [...letterboxdTags.map(({ name }) => name), ...recentTags]) {
    const key = tag.toLowerCase();
    if (tag === '' || seen.has(key)) continue;
    seen.add(key);
    merged.push(tag);
  }

  return merged;
}

const SKELETON_WIDTHS = ['w-16', 'w-10', 'w-20', 'w-14'] as const;

function TagChipSkeleton({
  width,
  onMeasure,
}: {
  width: string;
  onMeasure?: (height: number) => void;
}) {
  return (
    <View
      className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
      onLayout={
        onMeasure == null
          ? undefined
          : (event: LayoutChangeEvent) => onMeasure(event.nativeEvent.layout.height)
      }
    >
      <View className="absolute inset-0 rounded-full border border-border bg-surface" />
      <Skeleton className="h-3.5 w-3.5 rounded-full" />
      <View className="h-5 justify-center">
        <Skeleton className={cn('h-3 rounded-full', width)} />
      </View>
    </View>
  );
}

function TagChip({
  tag,
  selected,
  onToggle,
  onMeasure,
  entering,
}: {
  tag: string;
  selected: boolean;
  onToggle: () => void;
  onMeasure?: (height: number) => void;
  entering: EntryOrExitLayoutType;
}) {
  const accent = useThemeColor('--color-accent');
  const muted = useThemeColor('--color-muted');

  return (
    // pressto's wrapper forwards neither entering nor a Reanimated ref.
    <AnimatedView entering={entering}>
      <PresstableOpacity
        accessibilityLabel={selected ? `Remove tag ${tag}` : `Add tag ${tag}`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onToggle}
      >
        {/* onLayout sits on the chip's own box, not the pressable: pressto's
            wrapper does not forward it. */}
        <View
          className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
          onLayout={
            onMeasure == null
              ? undefined
              : (event: LayoutChangeEvent) => onMeasure(event.nativeEvent.layout.height)
          }
        >
          <View className="absolute inset-0 rounded-full border border-border bg-surface" />
          <AnimatedView
            className="absolute inset-0 rounded-full border border-accent bg-accent-tonal"
            style={{
              opacity: selected ? 1 : 0,
              transitionProperty: 'opacity',
              transitionDuration: DURATION.color,
              transitionTimingFunction: EASE_OUT,
            }}
          />
          <Ionicons
            color={selected ? accent : muted}
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={14}
          />
          <Text className="text-foreground font-sans text-sm">{tag}</Text>
        </View>
      </PresstableOpacity>
    </AnimatedView>
  );
}

export function TagPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const letterboxdTags = useLetterboxdTagsQuery();
  const recentTags = useRecentTags();
  const reduceMotion = useReducedMotion();
  const [openedWith] = useState(value);
  const [expanded, setExpanded] = useState(false);
  const [rowHeight, setRowHeight] = useState(0);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map());

  const fragment = useFilterFragment(activeTagFragment(value));
  const pool = pinSelectedTags(
    mergeTagSuggestions(letterboxdTags.data ?? [], recentTags),
    openedWith,
  ).slice(0, MAX_SUGGESTIONS);
  const suggestions = filterTagSuggestions(pool, fragment);
  const key = measureKey(suggestions);
  const contentHeight = heights.get(key) ?? 0;

  function measureContent(event: LayoutChangeEvent) {
    const height = event.nativeEvent.layout.height;
    setHeights((current) => {
      if (height <= (current.get(key) ?? 0) + ROW_EPSILON) return current;
      const next = current.size >= MAX_MEASURED_LISTS ? new Map() : new Map(current);
      next.set(key, height);
      return next;
    });
  }

  function measureRow(height: number) {
    setRowHeight((current) => (Math.abs(height - current) > ROW_EPSILON ? height : current));
  }

  const loading = suggestions.length === 0 && letterboxdTags.isFetching;

  if (suggestions.length === 0 && !loading) return null;

  const measured = rowHeight > 0 && contentHeight > 0;
  const overflows = measured ? contentHeight > rowHeight + ROW_EPSILON : suggestions.length > 1;
  const collapsed = loading || (overflows && !expanded);
  const showToggle = !loading && measured && overflows;

  return (
    <View className="mt-2">
      <View
        style={
          collapsed
            ? {
                height: rowHeight > 0 ? rowHeight : ESTIMATED_ROW_HEIGHT,
                overflow: 'hidden',
              }
            : undefined
        }
      >
        <View className="flex-row flex-wrap gap-2" onLayout={measureContent}>
          {loading
            ? SKELETON_WIDTHS.map((width, index) => (
                <TagChipSkeleton
                  key={width}
                  onMeasure={index === 0 ? measureRow : undefined}
                  width={width}
                />
              ))
            : suggestions.map((tag, index) => (
                <TagChip
                  entering={chipAnimation(index, reduceMotion)}
                  key={tag.toLowerCase()}
                  onMeasure={index === 0 ? measureRow : undefined}
                  onToggle={() => {
                    haptics.selection();
                    onChange(toggleTag(value, tag));
                  }}
                  selected={isTagSelected(value, tag)}
                  tag={tag}
                />
              ))}
        </View>
      </View>
      <AnimatedView
        aria-hidden={!showToggle}
        className="self-start"
        style={{
          pointerEvents: showToggle ? 'auto' : 'none',
          opacity: showToggle ? 1 : 0,
          transitionProperty: 'opacity',
          transitionDuration: reduceMotion ? 0 : DURATION.swap,
          transitionTimingFunction: EASE_OUT,
        }}
      >
        <PresstableOpacity
          accessibilityLabel={expanded ? 'Show fewer tag suggestions' : 'Show more tag suggestions'}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          className="flex-row items-center gap-1 self-start mt-1 pt-2 pb-5 -mb-4 -mx-2 px-2"
          onPress={() => setExpanded(!expanded)}
          pressBehavior="immediate"
        >
          <Text className="text-muted font-sans text-xs">
            {expanded ? 'Show less' : 'Show more'}
          </Text>
          <DisclosureChevron open={expanded} size={12} />
        </PresstableOpacity>
      </AnimatedView>
    </View>
  );
}
