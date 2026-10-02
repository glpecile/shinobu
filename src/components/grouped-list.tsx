import { Children, createContext, isValidElement, type ReactNode, useContext } from 'react';
import { View } from 'react-native';

import { CARD_SHELL } from '@/components/card-shell';
import { cn } from '@/lib/cn';

const DividerContext = createContext(false);

/** Groups `GroupedList.Item` children in one surface with inset dividers. */
export function GroupedList({ children }: { children: ReactNode }) {
  return (
    <View className={cn(CARD_SHELL, 'px-4 py-0')}>
      {Children.toArray(children).map((child, index) => (
        <DividerContext.Provider
          key={isValidElement(child) ? child.key : index}
          value={index > 0}
        >
          {child}
        </DividerContext.Provider>
      ))}
    </View>
  );
}

/** Owns row padding and its divider. `className` customizes content layout. */
function GroupedListItem({ children, className }: { children: ReactNode; className?: string }) {
  const divider = useContext(DividerContext);

  return (
    <View className={cn('py-4', divider && 'border-t border-border', className)}>
      {children}
    </View>
  );
}

GroupedList.Item = GroupedListItem;
