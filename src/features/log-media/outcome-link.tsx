import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { openExternalUrl } from '@/lib/open-external-url';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useThemeColor, type ThemeColorToken } from '@/lib/theme-color';

export type OutcomeLinkTone = 'accent' | 'neutral';

const TONE: Record<OutcomeLinkTone, { token: ThemeColorToken; label: string }> = {
  accent: { token: '--color-accent-on-tonal', label: 'text-accent-on-tonal' },
  neutral: { token: '--color-foreground', label: 'text-foreground' },
};

export function OutcomeLink({
  provider,
  url,
  tone = 'accent',
  verb = 'Log on',
}: {
  provider: ProviderId;
  url: string;
  tone?: OutcomeLinkTone;
  verb?: string;
}) {
  const color = useThemeColor(TONE[tone].token);

  return (
    <PresstableOpacity
      accessibilityLabel={`${verb} ${PROVIDERS[provider].label}`}
      accessibilityRole="button"
      className="min-h-11 justify-center"
      onPress={() => openExternalUrl(url)}
    >
      <View className="flex-row items-center gap-2">
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          color={color}
          name="open-outline"
          size={16}
        />
        <Text className={cn('font-sans-semibold text-sm', TONE[tone].label)}>
          {verb} {PROVIDERS[provider].label}
        </Text>
      </View>
    </PresstableOpacity>
  );
}
