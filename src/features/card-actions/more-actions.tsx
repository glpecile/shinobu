import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { Tooltip } from '@/components/tooltip';
import { AddToListPicker, useCanAddToList } from '@/features/lists/add-to-list-picker';
import { TrackingStatusPicker } from '@/features/tracking-status/tracking-status-picker';
import { useTrackingState } from '@/features/tracking-status/use-tracking-state';
import { useWriteTargetsSplit } from '@/features/watchlist-media/targets';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import type { TrackingStatus } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * Which secondary actions `item` has: a list add, and pause or drop when a
 * connected provider holds an entry it would move.
 */
function useMoreActions(item: NormalizedMediaItem) {
  const list = useCanAddToList(item);
  const targets = useWriteTargetsSplit(item, 'tracking');
  const { movable } = useTrackingState(targets.item, targets.writable);
  return { list, movable, tracking: movable.paused || movable.dropped };
}

/**
 * The "…" menu and the step each row opens, in one sheet. `onBack` leaves
 * the menu, and `onClose` closes the sheet after a clean write.
 */
export function MoreActions({
  item,
  onBack,
  onClose,
}: {
  item: NormalizedMediaItem;
  onBack: () => void;
  onClose: () => void;
}) {
  const { list, movable } = useMoreActions(item);
  const [step, setStep] = useState<'menu' | 'list' | TrackingStatus>('menu');
  const toMenu = () => setStep('menu');
  switch (step) {
    case 'list':
      return <AddToListPicker item={item} onBack={toMenu} onClose={onClose} />;
    case 'paused':
    case 'dropped':
      return <TrackingStatusPicker item={item} key={step} onCancel={toMenu} onCleanClose={onClose} status={step} />;
    case 'menu':
      return (
        <WriteSheet.Step key="menu">
          <WriteSheet.Header onClose={onBack}>
            <WriteSheet.Title>{item.title}</WriteSheet.Title>
          </WriteSheet.Header>
          <View className="mt-4 gap-2">
            {list && (
              <Button icon={<Button.Icon name="add" />} label="Add to list" onPress={() => setStep('list')} variant="quiet" />
            )}
            {movable.paused && (
              <Button icon={<Button.Icon name="pause" />} label="Pause tracking" onPress={() => setStep('paused')} variant="quiet" />
            )}
            {movable.dropped && (
              <Button icon={<Button.Icon name="close-circle-outline" />} label="Drop" onPress={() => setStep('dropped')} variant="quiet" />
            )}
          </View>
        </WriteSheet.Step>
      );
  }
}

/**
 * A title's main action with its secondary actions capsuled beside it, as
 * `ShareButton.Capsule` lays out Share. With pause and drop available the
 * capsule is "…" and opens `MoreActions`. With only a list add it stays
 * "Add to list", so a film's list add is not a one-row menu. Without a main
 * action (`children` null) the button takes the full width with its label.
 * `onOpen` lets a host sheet render the step in place instead of a second
 * sheet. `className` is layout for the row.
 */
export function MoreActionsCapsule({
  item,
  children,
  onOpen,
  className,
}: {
  item: NormalizedMediaItem;
  children: ReactNode;
  onOpen?: (step: 'more' | 'list') => void;
  className?: string;
}) {
  const { list, tracking } = useMoreActions(item);
  const [open, setOpen] = useState(false);
  // Remounts the content per open, so it starts on its first step.
  const [session, setSession] = useState(0);
  if (!list && !tracking) return children == null ? null : <View className={className}>{children}</View>;
  const label = tracking ? 'More actions' : 'Add to list';
  const icon = <Button.Icon name={tracking ? 'ellipsis-horizontal' : 'add'} />;
  function openSheet() {
    haptics.selection();
    if (onOpen != null) {
      onOpen(tracking ? 'more' : 'list');
      return;
    }
    setSession(session + 1);
    setOpen(true);
  }
  const close = () => setOpen(false);
  return (
    <>
      {children == null ? (
        <View className={className}>
          <Button icon={icon} label={label} onPress={openSheet} variant="quiet" />
        </View>
      ) : (
        <View className={cn('flex-row items-start gap-2', className)}>
          <View className="flex-1">{children}</View>
          <Button.Capsule>
            <Tooltip label={label}>
              <Button icon={icon} iconOnly label={label} onPress={openSheet} variant="ghost" />
            </Tooltip>
          </Button.Capsule>
        </View>
      )}
      {onOpen == null && (
        <Sheet onClose={close} open={open}>
          {session > 0 &&
            (tracking ? (
              <MoreActions item={item} key={session} onBack={close} onClose={close} />
            ) : (
              <AddToListPicker item={item} key={session} onClose={close} />
            ))}
        </Sheet>
      )}
    </>
  );
}
