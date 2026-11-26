import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { openExternalUrl } from '@/lib/open-external-url';
import { manualRowsFor } from '@/features/log-media/manual-write-links';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useThemeColor } from '@/lib/theme-color';
import type { NormalizedMediaItem } from '@/types/media';

export function ManualWriteRows({
  manual,
  item,
  verb = 'Log manually on',
  reasons,
}: {
  manual: readonly ProviderId[];
  item: NormalizedMediaItem;
  verb?: string;
  reasons?: Partial<Record<ProviderId, string>>;
}) {
  const muted = useThemeColor('--color-muted');
  const rows = manualRowsFor(manual, item);

  if (rows.length === 0) return null;

  return (
    <View className="mt-2 rounded-lg border border-border bg-background p-1">
      {rows.map(({ provider, url }) => {
        const reason = reasons?.[provider];
        return (
          <PresstableOpacity
            accessibilityLabel={
              reason == null
                ? `${verb} ${PROVIDERS[provider].label}`
                : `${verb} ${PROVIDERS[provider].label}. ${reason}`
            }
            className="flex-row items-center justify-between px-3 py-2.5 rounded-md"
            key={provider}
            onPress={() => openExternalUrl(url)}
          >
            <View className="flex-row items-center gap-3 flex-1 mr-3">
              <ProviderIcon id={provider} size={18} />
              <View className="flex-1">
                <Text className="text-muted font-sans-semibold text-sm">
                  {verb} {PROVIDERS[provider].label}
                </Text>
                {reason != null && (
                  <Text className="text-muted font-sans text-xs mt-0.5">{reason}</Text>
                )}
              </View>
            </View>
            <Ionicons color={muted} name="open-outline" size={16} />
          </PresstableOpacity>
        );
      })}
    </View>
  );
}
