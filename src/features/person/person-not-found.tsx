import { Text, View } from 'react-native';

import Head from '@/components/head';
import { PresstableOpacity } from '@/components/presstable';

/** Full-screen miss state shared by /person/[id] and /person/lookup. */
export function PersonNotFound({
  detail,
  onGoBack,
  onRetry,
}: {
  detail: string;
  onGoBack: () => void;
  /** Route-error variant: offer a retry alongside the escape hatch. */
  onRetry?: () => void;
}) {
  return (
    <View className="flex-1 bg-background items-center justify-center px-8">
      <Head>
        <title>Not found — Shinobu</title>
      </Head>
      <Text className="text-2xl font-display text-foreground mb-2">
        Not found
      </Text>
      <Text className="text-muted font-sans text-center mb-6">{detail}</Text>
      <View className="flex-row gap-3">
        {onRetry != null && (
          <PresstableOpacity
            className="border border-border px-5 py-3 rounded"
            onPress={onRetry}
          >
            <Text className="text-foreground font-sans-semibold">
              Try again
            </Text>
          </PresstableOpacity>
        )}
        <PresstableOpacity
          className="bg-accent px-5 py-3 rounded"
          onPress={onGoBack}
        >
          <Text className="text-accent-foreground font-sans-semibold">
            Go back
          </Text>
        </PresstableOpacity>
      </View>
    </View>
  );
}
