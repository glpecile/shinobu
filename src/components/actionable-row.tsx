import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity, PresstableScale } from '@/components/presstable';
import { useNewTabPress } from '@/components/use-new-tab-press';
import { cn } from '@/lib/cn';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * Web-only ⋯ that opens the row's actions dialog, sitting just past the row's
 * text and revealed while the pointer is over the row — long-press is the
 * native gesture and isn't discoverable with a mouse (same reasoning as the
 * media card's hover ⋯). The slot keeps its width whether or not the button
 * shows, so hovering never nudges the title.
 */
function RowActionsButton({
  item,
  visible,
  onActions,
}: {
  item: NormalizedMediaItem;
  visible: boolean;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  const muted = useCSSVariable('--color-muted');
  return (
    <View className="w-10 items-center">
      {visible && (
        <PresstableOpacity
          accessibilityLabel={`More options for ${item.title}`}
          accessibilityRole="button"
          className="w-8 h-8 items-center justify-center rounded-full bg-surface border border-border/60"
          onPress={() => onActions(item)}
        >
          <Ionicons
            color={typeof muted === 'string' ? muted : undefined}
            name="ellipsis-horizontal"
            size={16}
          />
        </PresstableOpacity>
      )}
    </View>
  );
}

/** Accessibility props forwarded to a row's pressable(s). */
export type RowAccessibility = Pick<
  ComponentProps<typeof PresstableScale>,
  'accessibilityHint' | 'accessibilityLabel' | 'accessibilityRole' | 'accessibilityState'
>;

export interface ActionableRowProps {
  item: NormalizedMediaItem;
  /** ⌘/Ctrl+click target on web. */
  href: string;
  onPress: () => void;
  onActions: (item: NormalizedMediaItem) => void;
  /** Poster + text, up to where the ⋯ sits. Shrinks; never `flex-1`. */
  leading: ReactNode;
  /** Provider marks, chevrons — pushed to the row's right edge. */
  trailing?: ReactNode;
  /** Padding/height for the row container. */
  className: string;
  accessibility?: RowAccessibility;
}

/**
 * The interaction shell every list row that has a card-actions dialog shares —
 * the diary's three row shapes and the search results (plan 0028 R2). Press
 * opens details (⌘/Ctrl+click opens them in a new tab on web), long-press opens
 * the actions dialog, and hovering reveals the ⋯ that opens that same dialog.
 *
 * The ⋯ belongs beside the title, but it can't be a *child* of the row's
 * pressable — nesting two gesture-handler buttons would let a ⋯ press bubble
 * into the row press. So on web the row is split into two sibling pressables,
 * leading (poster + title) and trailing (provider marks), with the ⋯ between
 * them: the button sits exactly where the title ends, and both halves carry the
 * same press/long-press, so the whole row stays one target. Native has no ⋯ —
 * long-press is its gesture — so it stays a single pressable and keeps a
 * whole-row press-scale.
 */
export function ActionableRow({
  item,
  href,
  onPress,
  onActions,
  leading,
  trailing,
  className,
  accessibility,
}: ActionableRowProps) {
  const [hovered, setHovered] = useState(false);
  const newTab = useNewTabPress(href);

  const pressProps = {
    ...accessibility,
    onLongPress: () => onActions(item),
    onPress: () => {
      if (newTab.opened()) return;
      onPress();
    },
  };

  if (process.env.EXPO_OS !== 'web') {
    return (
      <PresstableScale
        className={cn('flex-row items-center', className)}
        {...pressProps}
      >
        {leading}
        <View className="flex-1" />
        {trailing}
      </PresstableScale>
    );
  }

  return (
    <View
      className={cn('flex-row items-center', className)}
      onPointerDown={newTab.onPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <PresstableScale className="flex-row items-center shrink" {...pressProps}>
        {leading}
      </PresstableScale>
      <RowActionsButton item={item} onActions={onActions} visible={hovered} />
      {/* The empty stretch past the ⋯ is the same target as the title — a click
          anywhere on the row still opens the item. No a11y props here: the
          leading half already announces the row. */}
      <PresstableScale
        className="flex-1 flex-row items-center justify-end self-stretch"
        onLongPress={pressProps.onLongPress}
        onPress={pressProps.onPress}
      >
        {trailing}
      </PresstableScale>
    </View>
  );
}
