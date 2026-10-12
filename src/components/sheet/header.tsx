import { createContext, type ReactNode, useContext } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';

export const SheetCloseContext = createContext<(() => void) | null>(null);

/** Dismissal beside a sheet heading; inline steps can override what close means. */
export function SheetDismissHeader({ children, onClose, done = false }: {
  children: ReactNode;
  onClose?: () => void;
  done?: boolean;
}) {
  const closeSheet = useContext(SheetCloseContext);
  const close = onClose ?? closeSheet;
  if (close == null) throw new Error('Sheet.Header needs a Sheet or onClose.');

  return (
    <View className="flex-row items-start gap-3">
      <View className="flex-1 min-w-0">{children}</View>
      <Button
        className="shrink-0"
        icon={<Button.Icon name={done ? 'checkmark' : 'close'} />}
        iconOnly
        label={done ? 'Done' : 'Close'}
        onPress={close}
        shape="pill"
        variant="quiet"
      />
    </View>
  );
}
