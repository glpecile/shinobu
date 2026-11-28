import type { ReactNode } from 'react';
import { Platform, Text } from 'react-native';

import { openExternalUrl } from '@/lib/open-external-url';

/**
 * An external link inside a run of text. On web it renders a real `<a>`. `inApp` matches
 * `openExternalUrl` on native.
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
      {...(Platform.OS === 'web'
        ? { href: url, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } }
        : { onPress: () => void openExternalUrl(url, { inApp }) })}
    >
      {children}
    </Text>
  );
}
