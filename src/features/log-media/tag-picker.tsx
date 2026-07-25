import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import { DURATION, EASE_OUT } from '@/lib/motion';
import type { LetterboxdTag } from '@/lib/providers/letterboxd/tags';
import { useRecentTags } from '@/state/prefs/recent-tags';
import { useLetterboxdTagsQuery } from '@/state/queries/letterboxd';
import { hasTag, toggleTag } from './parse-tags';

/**
 * Enough to cover the tags a user actually reaches for without turning the
 * sheet into a wall of pills — the lists behind this are frequency/recency
 * ordered, so the tail is the part nobody taps.
 */
const MAX_SUGGESTIONS = 12;

/**
 * Letterboxd's own tags first (real, frequency-ordered, and the provider most
 * likely to be the reason the field is open), then anything used in Shinobu
 * that Letterboxd hasn't seen. Deduped case-insensitively — "Horror" and
 * "horror" are one tag to both providers, so showing both would offer the user
 * a duplicate.
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
    if (merged.length === MAX_SUGGESTIONS) break;
  }

  return merged;
}

function TagChip({
  tag,
  selected,
  onToggle,
}: {
  tag: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const accent = useCSSVariable('--color-accent');
  const muted = useCSSVariable('--color-muted');
  const accentColor = typeof accent === 'string' ? accent : undefined;
  const mutedColor = typeof muted === 'string' ? muted : undefined;

  return (
    <PresstableOpacity
      accessibilityLabel={selected ? `Remove tag ${tag}` : `Add tag ${tag}`}
      // Only ever "button" on a pressto pressable — RNGH's web gesture handler
      // fires presses on nothing else
      // (docs/solutions/web-pressto-accessibility-role-kills-onpress.md).
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onToggle}
    >
      <View className="flex-row items-center gap-1.5 rounded-full px-4 py-2">
        {/* Selection crossfades between two stacked full-bleed layers instead
            of hard-flipping classNames: opacity is free on the GPU, both states
            stay expressed as theme tokens (an animated backgroundColor would
            lose the accent's /10 alpha), and the resting layer underneath means
            a dropped animation still renders a correct chip — same recipe as
            the Up Next day tiles. */}
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
            under the user's finger. Matches ProviderToggle's checkmark idiom. */}
        <Ionicons
          color={selected ? accentColor : mutedColor}
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={14}
        />
        <Text className="text-foreground font-sans text-sm">{tag}</Text>
      </View>
    </PresstableOpacity>
  );
}

/**
 * Tappable suggestions under the tags input: the user's existing Letterboxd
 * tags plus whatever they've tagged with in Shinobu before. Typing stays the
 * primary path — this only saves the retyping — so it renders nothing at all
 * when neither source has anything to offer (Letterboxd not connected and
 * nothing logged yet), rather than an empty row or a dangling heading.
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
  const suggestions = mergeTagSuggestions(letterboxdTags.data ?? [], recentTags);

  if (suggestions.length === 0) return null;

  return (
    <View className="flex-row flex-wrap gap-2 mt-2">
      {suggestions.map((tag) => (
        <TagChip
          key={tag.toLowerCase()}
          onToggle={() => onChange(toggleTag(value, tag))}
          selected={hasTag(value, tag)}
          tag={tag}
        />
      ))}
    </View>
  );
}
