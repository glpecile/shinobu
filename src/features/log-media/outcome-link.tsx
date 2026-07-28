import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { openExternalUrl } from '@/lib/open-external-url';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

/**
 * The "{verb} {Provider}" external-link row shared by every fail-case surface
 * (plan 0022 R5/R6). `verb` defaults to the log path's wording so existing call
 * sites are unchanged; the watchlist verbs pass their own (plan 0031 U1).
 */
export function OutcomeLink({
  provider,
  url,
  accentColor,
  verb = 'Log on',
}: {
  provider: ProviderId;
  url: string;
  accentColor?: string;
  verb?: string;
}) {
  return (
    <PresstableOpacity onPress={() => openExternalUrl(url)}>
      <View className="flex-row items-center gap-1 mt-0.5">
        <Ionicons color={accentColor} name="open-outline" size={14} />
        <Text className="text-accent font-sans text-xs">
          {verb} {PROVIDERS[provider].label}
        </Text>
      </View>
    </PresstableOpacity>
  );
}
