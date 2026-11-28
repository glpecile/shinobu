import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { CenteredNotice } from '@/components/centered-notice';
import Head from '@/components/head';

export function PersonNotFound({
  detail,
  onGoBack,
  onRetry,
  onOpenSettings,
  title = 'Not found',
}: {
  detail?: string;
  onGoBack: () => void;
  /** Called after the query error boundary resets, so a route `ErrorBoundary` can pass `retry`. */
  onRetry?: () => void;
  onOpenSettings?: () => void;
  title?: string;
}) {
  const { reset } = useQueryErrorResetBoundary();
  return (
    <View className="flex-1 bg-background">
      <CenteredNotice>
        <Head>
          <title>{`${title} — Shinobu`}</title>
        </Head>
        <CenteredNotice.Glyph>忍</CenteredNotice.Glyph>
        <CenteredNotice.Title>{title}</CenteredNotice.Title>
        {detail != null && <CenteredNotice.Body>{detail}</CenteredNotice.Body>}
        <CenteredNotice.Actions>
          {onRetry != null && (
            <Button
              icon={<Button.Icon name="refresh" />}
              label="Try again"
              onPress={() => {
                // A remount alone rethrows the cached query error.
                reset();
                onRetry();
              }}
              variant="quiet"
            />
          )}
          {onOpenSettings != null && (
            <Button
              icon={<Button.Icon name="link-outline" />}
              label="Open Settings"
              onPress={onOpenSettings}
              variant="quiet"
            />
          )}
          <Button icon={<Button.Icon name="arrow-back" />} label="Go back" onPress={onGoBack} />
        </CenteredNotice.Actions>
      </CenteredNotice>
    </View>
  );
}
