import { Children, createContext, type ReactNode, useContext } from 'react';
import { Text, View } from 'react-native';

const StepNumberContext = createContext(0);

export function Steps({ children }: { children: ReactNode }) {
  return (
    <View className="gap-4">
      {Children.toArray(children).map((child, index) => (
        <StepNumberContext.Provider key={index} value={index + 1}>
          {child}
        </StepNumberContext.Provider>
      ))}
    </View>
  );
}

function StepItem({ children }: { children: ReactNode }) {
  const number = useContext(StepNumberContext);
  return (
    <View className="flex-row gap-3">
      <Text className="text-accent font-sans-semibold text-sm">{number}</Text>
      <View className="flex-1 gap-2">{children}</View>
    </View>
  );
}

Steps.Item = StepItem;
