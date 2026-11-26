import { View } from "react-native";
import type { FallbackProps } from "react-error-boundary";

import { Button } from "@/components/button";
import { CenteredNotice } from "@/components/centered-notice";
import { isStaleBundleError } from "@/lib/stale-bundle";

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const stale = isStaleBundleError(error);
  const message = stale
    ? "Shinobu couldn't load part of the app. Reload the page to get the latest version."
    : error instanceof Error ? error.message : "Unknown error";

  return (
    <View className="flex-1 bg-background">
      <CenteredNotice>
        <CenteredNotice.Glyph>忍</CenteredNotice.Glyph>
        <CenteredNotice.Title>Something broke</CenteredNotice.Title>
        <CenteredNotice.Body>{message}</CenteredNotice.Body>
        <CenteredNotice.Action
          icon={<Button.Icon name="refresh" />}
          label={stale ? "Reload" : "Try again"}
          onPress={stale ? () => window.location.reload() : resetErrorBoundary}
        />
      </CenteredNotice>
    </View>
  );
}
