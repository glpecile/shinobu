import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { LogMediaButton } from '@/features/log-media/log-media-button';
import { haptics } from '@/lib/haptics';
import { routes } from '@/lib/routes';
import { hideItem } from '@/state/prefs/hidden-items';
import type { NormalizedMediaItem } from '@/types/media';

interface CardActionsSheetProps {
  /** Kept (not nulled) while closing so content doesn't vanish mid-animation. */
  item: NormalizedMediaItem | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Per-card actions dialog for the feed: quick log, view details, hide.
 * Opened by long-press on a card everywhere, plus the hover ⋯ button on web
 * (long-press is not a discoverable web gesture). Quick log reuses
 * `LogMediaButton` wholesale — its confirm sheet (provider picker, backdate,
 * tags, partial-failure report) stacks above this one, and its outcome copy
 * lands here, so feed logging and details-page logging are one code path.
 */
export function CardActionsSheet({ item, open, onClose }: CardActionsSheetProps) {
  const router = useRouter();
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;

  return (
    <Sheet onClose={onClose} open={open && item != null}>
      {item != null && (
        <>
          <Text
            className="text-2xl font-display text-foreground"
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <Text className="text-muted font-sans text-sm mt-1">
            {[item.type, item.year != null ? String(item.year) : null]
              .filter((part) => part != null)
              .join(' · ')}
          </Text>

          <View className="mt-5">
            {/* key: the button's sheet/result state must not leak between items. */}
            <LogMediaButton item={item} key={item.id} />
            {item.type === 'TV' && (
              <Text className="text-muted font-sans text-sm mb-6">
                Episodes are logged per season from the details page.
              </Text>
            )}
          </View>

          <PresstableOpacity
            className="flex-row items-center gap-3 rounded px-5 py-3 border border-border"
            onPress={() => {
              onClose();
              router.push(routes.details(item.id));
            }}
          >
            <Ionicons color={mutedColor} name="open-outline" size={18} />
            <Text className="text-foreground font-sans-semibold text-base">
              View details
            </Text>
          </PresstableOpacity>
          <PresstableOpacity
            className="flex-row items-center gap-3 rounded px-5 py-3 mt-2 border border-border"
            onPress={() => {
              haptics.confirm();
              hideItem({ id: item.id, title: item.title });
              onClose();
            }}
          >
            <Ionicons color={mutedColor} name="eye-off-outline" size={18} />
            <Text className="text-foreground font-sans-semibold text-base">
              Hide from feed
            </Text>
          </PresstableOpacity>
        </>
      )}
    </Sheet>
  );
}
