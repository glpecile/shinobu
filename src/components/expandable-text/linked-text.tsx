import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text } from 'react-native';

import { openExternalUrl } from '@/lib/open-external-url';
import { useThemeColor } from '@/lib/theme-color';

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Render AniList's Markdown links inside the same paragraph and clamp as the biography. */
export function LinkedText({ text }: { text: string }) {
  const muted = useThemeColor('--color-muted');
  const parts: React.ReactNode[] = [];
  let start = 0;

  for (const match of text.matchAll(LINK)) {
    const index = match.index;
    parts.push(text.slice(start, index));
    const [markup, label, target] = match;
    let url: URL | undefined;
    try {
      url = new URL(target);
    } catch {
      // Untrusted provider text must never become an executable link.
    }
    parts.push(
      url?.protocol === 'https:' || url?.protocol === 'http:' ? (
        <Text
          accessibilityRole="link"
          className="text-foreground underline"
          key={index}
          onPress={(event) => {
            event.stopPropagation();
            void openExternalUrl(url.href);
          }}
        >
          {label}{' '}
          <Ionicons color={muted} name="open-outline" size={14} />
        </Text>
      ) : (
        label
      ),
    );
    start = index + markup.length;
  }
  parts.push(text.slice(start));
  return <>{parts}</>;
}
