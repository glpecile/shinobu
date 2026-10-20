import { type ReactNode, useContext } from 'react';
import { Keyboard, View } from 'react-native';

import { Button } from '@/components/button';
import { cn } from '@/lib/cn';

import { SheetCloseContext } from './context';

/** Dismissal beside a sheet heading; inline steps can override what close means. */
export function SheetDismissHeader({ children, className, onClose, done = false }: {
  children: ReactNode;
  /** Layout only: alignment and spacing around the header. */
  className?: string;
  onClose?: () => void;
  done?: boolean;
}) {
  const closeSheet = useContext(SheetCloseContext);
  const close = onClose ?? closeSheet;
  if (close == null) throw new Error('Sheet.Header needs a Sheet or onClose.');

  return (
    <View className={cn('flex-row items-start gap-3', className)}>
      <View className="flex-1 min-w-0">{children}</View>
      <Button
        className="shrink-0"
        icon={<Button.Icon name={done ? 'checkmark' : 'close'} />}
        iconOnly
        label={done ? 'Done' : 'Close'}
        // A step's own `onClose` bypasses the sheet's close, so blur the field here too.
        onPress={() => {
          Keyboard.dismiss();
          close();
        }}
        shape="pill"
        variant="quiet"
      />
    </View>
  );
}
