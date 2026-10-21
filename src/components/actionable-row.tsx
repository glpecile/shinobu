import { useState, type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';

import { OverlayActionsButton } from '@/components/overlay-actions-button';
import { PresstableScale } from '@/components/presstable';
import { useNewTabPress } from '@/components/use-new-tab-press';
import { cn } from '@/lib/cn';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The ⋯ that opens the row's actions dialog. Editable lists keep it visible
 * on touch devices; other rows reveal it on hover and use long-press on touch.
 * Fine pointers reserve the hover slot
 * so revealing the control never nudges the title.
 */
function RowActionsButton({
  item,
  visible,
  showActions,
  onActions,
}: {
  item: NormalizedMediaItem;
  visible: boolean;
  showActions: boolean;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  const alwaysVisible = showActions && process.env.EXPO_OS !== 'web';
  return (
    <View
      className={cn(alwaysVisible ? 'flex' : 'hidden pointer-fine:flex', showActions ? 'w-11' : 'w-10', 'shrink-0 items-center')}
    >
      <OverlayActionsButton
        label={`More options for ${item.title}`}
        onPress={() => onActions(item)}
        size={showActions ? 'lg' : 'sm'}
        tone="surface"
        visible={visible || alwaysVisible}
      />
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
  pressBehavior?: ComponentProps<typeof PresstableScale>['pressBehavior'];
  onActions: (item: NormalizedMediaItem) => void;
  /** Poster and text; fills the available width when actions stay visible. */
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
 * The ⋯ can't be a *child* of the row's pressable — nesting two
 * gesture-handler buttons would let a ⋯ press bubble
 * into the row press. So on web the row is split into two sibling pressables,
 * leading (poster + title) and trailing (provider marks). Editable lists put
 * the ⋯ at the far edge; hover-only rows keep it beside the title.
 * Both halves carry the same press/long-press. Native rows use this split
 * when `showActions` exposes the control; otherwise they stay one pressable.
 */
export function ActionableRow({
  item,
  href,
  onPress,
  pressBehavior,
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
    pressBehavior,
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

  const actionsButton = (
    <RowActionsButton item={item} onActions={onActions} visible={hovered} showActions={showActions} />
  );

  return (
    <View
      className={cn('flex-row items-center', className)}
      onPointerDown={newTab.onPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <PresstableScale className={cn('flex-row items-center shrink min-w-0', showActions && 'flex-1')} {...pressProps}>
        {leading}
      </PresstableScale>
      {!showActions && actionsButton}
      {/* Trailing marks and the space around them also open the item. No a11y
          props here: the leading half already announces the row. */}
      <PresstableScale
        className={cn('shrink-0 flex-row items-center justify-end self-stretch', showActions ? 'ml-2' : 'grow')}
        onLongPress={pressProps.onLongPress}
        onPress={pressProps.onPress}
        pressBehavior={pressBehavior}
      >
        {trailing}
      </PresstableScale>
      {showActions && actionsButton}
    </View>
  );
}
