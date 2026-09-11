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
      {/* The 忍 mark, as on every other dead end (root error fallback, empty
          search). Deliberately unstyled by family: neither app font ships
          kanji (AGENTS.md, Theming). */}
      <Text className="text-5xl text-muted mb-4">忍</Text>
      <Text className="text-2xl font-display text-foreground mb-2">
        Not found
      </Text>
      <Text className="text-muted font-sans text-center mb-6">{detail}</Text>
      <View className="flex-row gap-3">
        {onRetry != null && (
          <Button
            icon={<Button.Icon name="refresh" />}
            label="Try again"
            onPress={onRetry}
            variant="quiet"
          />
        )}
        <Button icon={<Button.Icon name="arrow-back" />} label="Go back" onPress={onGoBack} />
      </View>
    </View>
  );
}
