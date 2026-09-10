import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import Head from '@/components/head';

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
          <Button label="Try again" onPress={onRetry} variant="quiet" />
        )}
        <Button label="Go back" onPress={onGoBack} />
      </View>
    </View>
  );
}
