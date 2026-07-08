import { Text, View } from "react-native";
import type { FallbackProps } from "react-error-boundary";

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : "Unknown error";

  return (
    <View className="flex-1 bg-background items-center justify-center px-8">
      <Text className="text-5xl font-display text-foreground mb-4">忍</Text>
      <Text className="text-2xl font-display text-foreground mb-2">
        Something broke
      </Text>
      <Text className="text-base font-sans text-muted text-center mb-8 max-w-sm">
        {message}
      </Text>
      <Text
        className="text-accent font-sans-semibold text-base"
        onPress={resetErrorBoundary}
      >
        Try again
      </Text>
    </View>
  );
}
