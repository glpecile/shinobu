import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { openExternalUrl } from '@/lib/open-external-url';
import { manualRowsFor } from '@/features/log-media/manual-write-links';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The upfront manual rows (plan 0022 R3/R4, plan 0032 R5/R11) — informational,
 * never a toggle: muted styling (not accent) so they read as distinct from the
 * writable providers above, and they never affect a caller's `canConfirm` or
 * confirm label (those only ever see `targets`/`selectedProviders`, which
 * exclude manual-only providers entirely).
 *
 * With plan 0032 these rows are the *only* surface a manual-declared or
 * platform-banned provider gets — the standing rows left the details screen
 * (R11) — so each row now carries its reason when the caller can name one
 * (R5: "can't be added from the web"). The link contract is unchanged:
 * `manualRowsFor` degrades to the provider's home URL, so the affordance never
 * vanishes silently.
 */
export function ManualWriteRows({
  manual,
  item,
  verb = 'Log manually on',
  reasons,
}: {
  manual: readonly ProviderId[];
  item: NormalizedMediaItem;
  /** Row wording — "Log manually on" (log sheet), "Add on", "Remove on". */
  verb?: string;
  /**
   * R5's reason line per provider, when the caller can state one — e.g.
   * Letterboxd on web's "can't be added from the web". Rows without an entry
   * render label-only, exactly the pre-0032 shape.
   */
  reasons?: Partial<Record<ProviderId, string>>;
}) {
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  const rows = manualRowsFor(manual, item);

  if (rows.length === 0) return null;

  return (
    <View className="mt-2 rounded-lg border border-border bg-background p-1">
      {rows.map(({ provider, url }) => {
        const reason = reasons?.[provider];
        return (
          <PresstableOpacity
            accessibilityLabel={`${verb} ${PROVIDERS[provider].label}`}
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
                  <Text className="text-muted font-sans text-xs mt-0.5">
                    {reason}
                  </Text>
                )}
              </View>
            </View>
            <Ionicons color={mutedColor} name="open-outline" size={16} />
          </PresstableOpacity>
        );
      })}
    </View>
  );
}
