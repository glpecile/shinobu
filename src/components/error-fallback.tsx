import { Text, View } from "react-native";
import type { FallbackProps } from "react-error-boundary";

import { isStaleBundleError } from "@/lib/stale-bundle";

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const stale = isStaleBundleError(error);
  const message = stale
    ? "Shinobu couldn't load part of the app. Reload the page to get the latest version."
    : error instanceof Error ? error.message : "Unknown error";

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
        onPress={stale ? () => window.location.reload() : resetErrorBoundary}
      >
        {stale ? "Reload" : "Try again"}
      </Text>
    </View>
  );
}
