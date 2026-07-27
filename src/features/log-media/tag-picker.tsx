import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useDeferredValue, useState } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import {
  type EntryOrExitLayoutType,
  FadeIn,
  useReducedMotion,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import { DURATION, EASE_IN_OUT, EASE_OUT } from '@/lib/motion';
import type { LetterboxdTag } from '@/lib/providers/letterboxd/tags';
import { useRecentTags } from '@/state/prefs/recent-tags';
import { useLetterboxdTagsQuery } from '@/state/queries/letterboxd';
import {
  activeTagFragment,
  filterTagSuggestions,
  isTagSelected,
  pinSelectedTags,
  toggleTag,
} from './parse-tags';

/**
 * Generous, because the row collapses to a single line anyway — the cap is
 * only here so an enormous tag vocabulary can't make the expanded state
 * unusable. A bigger pool also gives the type-to-filter more to match against.
 *
 * Applied *after* `pinSelectedTags`, so a selected tag can never be the one the
 * cap drops — the tags the sheet opened with are the ones that must survive
 * every trim.
 */
const MAX_SUGGESTIONS = 24;

/**
 * Stagger between chips, and the index past which they stop staggering. The
 * common arrival is the whole vocabulary at once (the Letterboxd query resolves
 * a beat after the sheet opens), so an uncapped stagger would put the last chip
 * half a second behind the first. Five steps is enough to read as a cascade;
 * everything after rides the last one in.
 */
const CHIP_STAGGER = 20;
const CHIP_STAGGER_STEPS = 5;

/**
 * **A preset (`FadeIn`), never a custom `Keyframe`.** On web, Reanimated pins
 * any element animated by a *custom* keyframe to `position: absolute` once the
 * animation is cleaned up (`setElementPosition`, only reached when the
 * animation name isn't one of its own presets). Every chip then leaves the
 * flow, the wrapping row measures 0px tall, and the sheet's buttons ride up
 * over the chips — `docs/solutions/reanimated-web-keyframe-pins-position.md`.
 * A rise-and-fade would be marginally nicer; keeping the chips in the layout
 * they are measured by is worth more.
 *
 * Module scope, per Reanimated's animation-builder performance rule — one
 * builder per stagger step, rather than a new one per chip per render.
 */
const chipEntering = Array.from({ length: CHIP_STAGGER_STEPS }, (_, step) =>
  FadeIn.duration(DURATION.swap).delay(step * CHIP_STAGGER),
);

/** Reduced motion keeps the fade and drops the stagger. */
const chipFading = FadeIn.duration(DURATION.swap);

function chipAnimation(
  index: number,
  reduceMotion: boolean,
): EntryOrExitLayoutType {
  if (reduceMotion) return chipFading;
  return chipEntering[Math.min(index, CHIP_STAGGER_STEPS - 1)];
}

/** Sub-pixel layout noise must not read as a second row. */
const ROW_EPSILON = 2;

/**
 * One chip's height before anything has been measured — `py-2` either side of
 * a `text-sm` line. Off by a pixel or two at most, and only for the first
 * frame, but that frame is the one that decides how tall the sheet *opens*: a
 * picker that paints its whole vocabulary before collapsing opens the sheet at
 * its cap and then snaps it down. Guessing low and clipping is the cheaper
 * mistake (docs/solutions/sheet-scroller-swap-render-loop.md).
 */
const ESTIMATED_ROW_HEIGHT = 36;

/**
 * Measured row heights, keyed by the rendered chip list. Bounded because the
 * key is a filtered list and typing produces a new one per character.
 */
const MAX_MEASURED_LISTS = 64;

/**
 * Cache key for a rendered chip list. Joined on a comma because that is the
 * one character a tag cannot contain — the field itself is comma-separated, so
 * `parseTags` could never hand back a tag holding one. Joining on a space
 * would collide: ["sped up"] and ["sped", "up"] are different lists that must
 * not share a measurement.
 */
function measureKey(suggestions: readonly string[]): string {
  return suggestions.join(',');
}

/**
 * The fragment the chips actually filter by.
 *
 * `useDeferredValue` rather than a timer: re-filtering and re-measuring a
 * couple of dozen chips is the slow part of a keystroke, and deferring lets
 * React keep the input responsive and *interrupt* a superseded pass instead of
 * racing a fixed delay. Every keystroke still lands — it may just render
 * against a slightly stale chip list.
 *
 * A reset is the exception and applies immediately. An empty fragment means
 * the user committed a tag (typed a comma, or tapped a chip — `toggleTag`
 * always leaves a separator), and showing the old filtered list for even one
 * extra frame after that tap is precisely the lag that reads as the list
 * jumping around on its own.
 */
function useFilterFragment(fragment: string): string {
  const deferred = useDeferredValue(fragment);
  return fragment === '' ? '' : deferred;
}

/**
 * Letterboxd's own tags first (real, frequency-ordered, and the provider most
 * likely to be the reason the field is open), then anything used in Shinobu
 * that Letterboxd hasn't seen. Deduped case-insensitively — "Horror" and
 * "horror" are one tag to both providers, so showing both would offer the user
 * a duplicate.
 *
 * Uncapped: `MAX_SUGGESTIONS` is applied after the selected tags are pinned, so
 * that trimming a long vocabulary can't cut the user's own selection.
 */
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
  /** Set on the first chip only — its height is one row's height. */
  onMeasure?: (height: number) => void;
  entering: EntryOrExitLayoutType;
}) {
  const accent = useCSSVariable('--color-accent');
  const muted = useCSSVariable('--color-muted');
  const accentColor = typeof accent === 'string' ? accent : undefined;
  const mutedColor = typeof muted === 'string' ? muted : undefined;

  return (
    // The animation goes on a wrapper, not the pressable: pressto's wrapper
    // forwards neither `entering` nor a ref Reanimated could drive. Chips are
    // keyed by tag, so only the ones that genuinely just appeared play it —
    // a chip that survives a keystroke or a pool refresh sits still.
    <AnimatedView entering={entering}>
      <PresstableOpacity
        accessibilityLabel={selected ? `Remove tag ${tag}` : `Add tag ${tag}`}
        // Only ever "button" on a pressto pressable — RNGH's web gesture handler
        // fires presses on nothing else
        // (docs/solutions/web-pressto-accessibility-role-kills-onpress.md).
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
              : (event: LayoutChangeEvent) =>
                  onMeasure(event.nativeEvent.layout.height)
          }
        >
          {/* Selection crossfades between two stacked full-bleed layers instead
              of hard-flipping classNames: opacity is free on the GPU, both
              states stay expressed as theme tokens (an animated
              backgroundColor would lose the accent's /10 alpha), and the
              resting layer underneath means a dropped animation still renders a
              correct chip — same recipe as the Up Next day tiles. */}
          <View className="absolute inset-0 rounded-full border border-border bg-surface" />
          <AnimatedView
            className="absolute inset-0 rounded-full border border-accent bg-accent/10"
            style={{
              opacity: selected ? 1 : 0,
              transitionProperty: 'opacity',
              transitionDuration: DURATION.color,
              transitionTimingFunction: EASE_OUT,
            }}
          />
          {/* The unselected chip keeps an outline dot rather than dropping the
              icon: a chip that grows on tap would reflow the whole wrapped row
              under the user's finger. Matches ProviderToggle's checkmark
              idiom. */}
          <Ionicons
            color={selected ? accentColor : mutedColor}
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={14}
          />
          <Text className="text-foreground font-sans text-sm">{tag}</Text>
        </View>
      </PresstableOpacity>
    </AnimatedView>
  );
}

/**
 * Tappable suggestions under the tags input: the user's existing Letterboxd
 * tags plus whatever they've tagged with in Shinobu before. Typing stays the
 * primary path — this only saves the retyping — so it renders nothing at all
 * when neither source has anything to offer (Letterboxd not connected and
 * nothing logged yet), rather than an empty row or a dangling heading.
 *
 * Collapsed to a single row by default: a full vocabulary is a dozen-plus
 * chips, and five rows of them push the confirm button off a phone screen.
 * Typing filters the list (see `filterTagSuggestions`), which is the faster
 * path to a specific tag than expanding and hunting.
 *
 * The frequency count on `LetterboxdTag` is deliberately not shown: the chips
 * are already ordered by it, so printing it would repeat the ordering as noise
 * next to the selection icon.
 */
export function TagPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  // Plain (non-suspense) query on purpose: the picker is an enhancement over
  // the input, so "still loading" and "Letterboxd not connected" are the same
  // thing here — render the recents and let the chips fill in.
  const letterboxdTags = useLetterboxdTagsQuery();
  const recentTags = useRecentTags();
  const reduceMotion = useReducedMotion();
  const muted = useCSSVariable('--color-muted');
  // The field as the sheet opened, and the only thing the pinning reads.
  // Pinning off the *live* value would re-sort the row on every tap, sliding
  // the chips out from under the finger that just pressed one — the same
  // reflow the chip's fixed-width icon exists to avoid. What the row owes the
  // user is that the tags they arrived with are visible in the collapsed row;
  // a tag they select here is already visible, by definition.
  const [openedWith] = useState(value);
  const [expanded, setExpanded] = useState(false);
  const [rowHeight, setRowHeight] = useState(0);
  // Heights are only comparable within one set of chips, so they are cached
  // per list rather than held as a single value. Caching instead of resetting
  // on every change is what stops the jump: committing a tag returns the list
  // to the full, already-measured vocabulary, so it collapses on its first
  // frame instead of painting all five rows and snapping back. Within a key
  // the height only ever grows, which also guards against a clipped re-measure
  // reporting the collapsed height back and flipping `overflows` off.
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );

  const fragment = useFilterFragment(activeTagFragment(value));
  // Pin before capping, filter after: the tags the sheet opened with lead the
  // row whatever the vocabulary does, and typing still re-ranks the whole
  // visible pool by what matches.
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
      // Dropping everything on overflow costs one re-measure of what is on
      // screen; tracking recency to evict precisely would cost more than the
      // frame it saves.
      const next =
        current.size >= MAX_MEASURED_LISTS ? new Map() : new Map(current);
      next.set(key, height);
      return next;
    });
  }

  function measureRow(height: number) {
    setRowHeight((current) =>
      Math.abs(height - current) > ROW_EPSILON ? height : current,
    );
  }

  if (suggestions.length === 0) return null;

  const measured = rowHeight > 0 && contentHeight > 0;
  // Until both heights are in, assume anything past a single chip wraps. The
  // guess only ever costs a frame of a clipped row; the alternative — assuming
  // it fits — costs the sheet's entire opening height (see
  // ESTIMATED_ROW_HEIGHT).
  const overflows = measured
    ? contentHeight > rowHeight + ROW_EPSILON
    : suggestions.length > 1;
  const collapsed = overflows && !expanded;

  return (
    <View className="mt-2">
      {/* The chips always render in full — only this wrapper's height changes.
          Measuring a list that is itself being hidden would mean the collapsed
          height feeds back into the decision to collapse. */}
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
          {suggestions.map((tag, index) => (
            <TagChip
              entering={chipAnimation(index, reduceMotion)}
              key={tag.toLowerCase()}
              onMeasure={index === 0 ? measureRow : undefined}
              onToggle={() => onChange(toggleTag(value, tag))}
              selected={isTagSelected(value, tag)}
              tag={tag}
            />
          ))}
        </View>
      </View>
      {/* The toggle's row is **always** in the layout — it only fades in and
          out. It can't be there when the sheet opens: it waits on the tag
          query, then on a measurement of what that query returned, so mounting
          it late shoved the confirm button ~34px down a beat after the user
          was already reaching for it. Reserving its height costs an empty band
          under a picker whose whole vocabulary fits on one line; that band is
          invisible, and the shove was not.

          Reserved by keeping the real row mounted rather than by a constant:
          a hardcoded height would drift from the font the moment `text-xs` or
          `py-1` changed, on the one row whose whole job is to not move.

          `measured` and not just `overflows`: the pre-measurement guess above
          is allowed to clip for a frame, but a toggle that turns on and then
          off again reads as a glitch. */}
      <AnimatedView
        // Hidden means *gone* to a pointer and to assistive tech — an
        // invisible spacer must never take a tap or a screen-reader stop.
        aria-hidden={!(measured && overflows)}
        className="self-start"
        pointerEvents={measured && overflows ? 'auto' : 'none'}
        style={{
          opacity: measured && overflows ? 1 : 0,
          transitionProperty: 'opacity',
          transitionDuration: reduceMotion ? 0 : DURATION.swap,
          transitionTimingFunction: EASE_OUT,
        }}
      >
        <PresstableOpacity
          accessibilityLabel={
            expanded ? 'Show fewer tag suggestions' : 'Show more tag suggestions'
          }
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          className="flex-row items-center gap-1 self-start mt-2 py-1"
          onPress={() => setExpanded(!expanded)}
        >
          <Text className="text-muted font-sans text-xs">
            {expanded ? 'Show less' : 'Show more'}
          </Text>
          <AnimatedView
            style={{
              transform: [{ rotate: expanded ? '180deg' : '0deg' }],
              transitionProperty: 'transform',
              transitionDuration: reduceMotion ? 0 : DURATION.toggle,
              transitionTimingFunction: EASE_IN_OUT,
            }}
          >
            <Ionicons
              color={typeof muted === 'string' ? muted : undefined}
              name="chevron-down"
              size={12}
            />
          </AnimatedView>
        </PresstableOpacity>
      </AnimatedView>
    </View>
  );
}
