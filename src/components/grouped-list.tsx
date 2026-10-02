import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { CARD_SHELL } from '@/components/card-shell';
import { cn } from '@/lib/cn';

/** Groups row children in one surface with inset dividers between them. */
export function GroupedList({ children }: { children: ReactNode }) {
  return (
    <View className={cn(CARD_SHELL, 'px-4 py-0')}>
      {Children.toArray(children).map((child, index) => (
        <View
          className={cn(index > 0 && 'border-t border-border')}
          key={isValidElement(child) ? child.key : index}
        >
          {child}
        </View>
      ))}
    </View>
  );
}
