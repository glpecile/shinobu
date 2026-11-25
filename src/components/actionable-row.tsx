import { useState, type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';

import { OverlayActionsButton } from '@/components/overlay-actions-button';
import { PresstableScale } from '@/components/presstable';
import { useNewTabPress } from '@/components/use-new-tab-press';
import { cn } from '@/lib/cn';
import type { NormalizedMediaItem } from '@/types/media';

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
  leading: ReactNode;
  trailing?: ReactNode;
  className: string;
  accessibility?: RowAccessibility;
}

/**
 * Splits into sibling pressables around the actions button because nesting two
 * gesture-handler buttons lets a press on the inner button bubble into the row.
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
