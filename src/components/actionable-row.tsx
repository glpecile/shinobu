import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';

import { PresstableOpacity, PresstableScale } from '@/components/presstable';
import { useNewTabPress } from '@/components/use-new-tab-press';
import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The ⋯ that opens the row's actions dialog, sitting just past the row's
 * text. Editable lists keep it visible on touch devices; other rows reveal it
 * on hover and use long-press on touch. Fine pointers reserve the hover slot
 * so revealing the control never nudges the title.
 */
function RowActionsButton({
  item,
  visible,
  alwaysVisible = false,
  onActions,
}: {
  item: NormalizedMediaItem;
  visible: boolean;
  alwaysVisible?: boolean;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  const muted = useThemeColor('--color-muted');
  const [focused, setFocused] = useState(false);
  const shown = visible || alwaysVisible || focused;
  return (
    <View
      className={cn(alwaysVisible ? 'flex w-11' : 'hidden pointer-fine:flex w-10', 'shrink-0 items-center')}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ opacity: shown ? 1 : 0, pointerEvents: shown ? 'auto' : 'none' }}
    >
      {(process.env.EXPO_OS === 'web' || shown) && (
        <PresstableOpacity
          accessibilityLabel={`More options for ${item.title}`}
          accessibilityRole="button"
          className={cn(alwaysVisible ? 'w-11 h-11' : 'w-8 h-8', 'items-center justify-center rounded-full bg-surface border border-border/60 web:focus-visible:outline-2 web:focus-visible:outline-accent web:focus-visible:outline-offset-2')}
          onPress={() => onActions(item)}
        >
          <Ionicons
            color={muted}
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
  showActions?: boolean;
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
 * them. Both halves carry the same press/long-press. Native rows use this split
 * when `showActions` exposes the control; otherwise they stay one pressable.
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
  showActions = false,
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

  if (process.env.EXPO_OS !== 'web' && !showActions) {
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
      <PresstableScale className="flex-row items-center shrink min-w-0" {...pressProps}>
        {leading}
      </PresstableScale>
      <RowActionsButton item={item} onActions={onActions} visible={hovered} alwaysVisible={showActions && process.env.EXPO_OS !== 'web'} />
      {/* The empty stretch past the ⋯ is the same target as the title — a click
          anywhere on the row still opens the item. No a11y props here: the
          leading half already announces the row. */}
      <PresstableScale
        className="grow shrink-0 flex-row items-center justify-end self-stretch"
        onLongPress={pressProps.onLongPress}
        onPress={pressProps.onPress}
      >
        {trailing}
      </PresstableScale>
    </View>
  );
}
