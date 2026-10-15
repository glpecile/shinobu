// oxlint-disable-next-line no-restricted-imports -- this wrapper owns Markdown typography and link policy.
import { EnrichedMarkdownText } from 'react-native-enriched-markdown';

import { openExternalUrl } from '@/lib/open-external-url';
import { useThemeColor } from '@/lib/theme-color';

/** Provider Markdown, styled as body copy, with HTTP(S)-only external links. */
export function MarkdownText({
  text,
  numberOfLines,
}: {
  text: string;
  numberOfLines?: number;
}) {
  const foreground = useThemeColor('--color-foreground');
  const muted = useThemeColor('--color-muted');
  const surface = useThemeColor('--color-surface');
  const border = useThemeColor('--color-border');
  const paragraph = {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 26,
    color: foreground,
    marginTop: 0,
    marginBottom: 0,
  };
  const heading = { ...paragraph, fontFamily: 'Inter_600SemiBold' };

  return (
    <EnrichedMarkdownText
      enableLinkPreview={false}
      markdown={text}
      markdownStyle={{
        paragraph,
        h1: heading,
        h2: heading,
        h3: heading,
        h4: heading,
        h5: heading,
        h6: heading,
        strong: { fontFamily: 'Inter_600SemiBold', fontWeight: 'normal' },
        em: { fontFamily: 'Inter_400Regular_Italic', fontStyle: 'normal' },
        link: { color: foreground, underline: true },
        list: { ...paragraph, bulletColor: muted, markerColor: muted },
        blockquote: { ...paragraph, borderColor: border },
        code: { color: foreground, backgroundColor: surface },
        codeBlock: { ...paragraph, backgroundColor: surface, borderColor: border },
        thematicBreak: { color: border },
      }}
      md4cFlags={{ latexMath: false, hardSoftBreaks: true, preserveBlankLines: true }}
      numberOfLines={numberOfLines}
      onLinkPress={({ url: target }) => {
        let url: URL;
        try {
          url = new URL(target);
        } catch {
          return;
        }
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          void openExternalUrl(url.href);
        }
      }}
    />
  );
}
