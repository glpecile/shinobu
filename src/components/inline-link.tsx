import type { ReactNode } from 'react';
import { Platform, Text } from 'react-native';

import { openExternalUrl } from '@/lib/open-external-url';

/**
 * An external link inside a run of text. On web it renders a real `<a>`, so it is a tab stop and
 * opens on Enter. `inApp` matches `openExternalUrl` on native.
 */
export function InlineLink({
  url,
  inApp = true,
  children,
}: {
  url: string;
  inApp?: boolean;
  children: ReactNode;
}) {
  return (
    <Text
      accessibilityRole="link"
      className="text-accent font-sans-semibold underline"
      // React Native's Text types lack react-native-web's `href` and `hrefAttrs`.
      {...(Platform.OS === 'web'
        ? { href: url, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } }
        : { onPress: () => void openExternalUrl(url, { inApp }) })}
    >
      {children}
    </Text>
  );
}
