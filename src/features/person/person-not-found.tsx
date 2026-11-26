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
  detail: string;
  onGoBack: () => void;
  onRetry?: () => void;
  onOpenSettings?: () => void;
  title?: string;
}) {
  return (
    <View className="flex-1 bg-background">
      <CenteredNotice>
        <Head>
          <title>{`${title} — Shinobu`}</title>
        </Head>
        <CenteredNotice.Glyph>忍</CenteredNotice.Glyph>
        <CenteredNotice.Title>{title}</CenteredNotice.Title>
        <CenteredNotice.Body>{detail}</CenteredNotice.Body>
        <CenteredNotice.Actions>
          {onRetry != null && (
            <Button
              icon={<Button.Icon name="refresh" />}
              label="Try again"
              onPress={onRetry}
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
