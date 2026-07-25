import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { Sheet } from '@/components/sheet';
import { LogMediaButton } from '@/features/log-media/log-media-button';
import { haptics } from '@/lib/haptics';
import { openExternalUrl } from '@/lib/open-external-url';
import { PROVIDERS } from '@/lib/providers/registry';
import { sourceLinkFor } from '@/lib/providers/provider-links';
import { routes } from '@/lib/routes';
import { hideItem } from '@/state/prefs/hidden-items';
import { useTraktMediaImages } from '@/state/queries/trakt';
import type { NormalizedMediaItem } from '@/types/media';

interface CardActionsSheetProps {
  /** Kept (not nulled) while closing so content doesn't vanish mid-animation. */
  item: NormalizedMediaItem | null;
  open: boolean;
  onClose: () => void;
  /**
   * Copy for the hide row, naming the surface the user is looking at
   * ("Hide from diary" on the Diary). Hiding itself is one global set —
   * feed, watchlist, Up Next and diary all read it — reversible from
   * Settings → Hidden items.
   */
  hideLabel?: string;
}

/** The item's artwork, recovered lazily when the log it came from is artless. */
function SheetPoster({ item }: { item: NormalizedMediaItem }) {
  const { coverImage } = useTraktMediaImages(item);
  if (coverImage === '')
    return <PosterPlaceholder className="w-14 h-[84px] rounded" />;
  return (
    <Image
      source={{ uri: coverImage }}
      className="w-14 h-[84px] rounded bg-surface border border-border/50"
      contentFit="cover"
      recyclingKey={item.id}
    />
  );
}

/**
 * Per-item actions dialog for the feed and the diary: quick log, view details,
 * view on the source provider, hide. Opened by long-press on a card or diary
 * row everywhere, plus the hover ⋯ button on web (long-press is not a
 * discoverable web gesture). Quick log reuses
 * `LogMediaButton` wholesale — its confirm sheet (provider picker, backdate,
 * tags, partial-failure report) stacks above this one, and its outcome copy
 * lands here, so feed logging and details-page logging are one code path.
 */
export function CardActionsSheet({
  item,
  open,
  onClose,
  hideLabel = 'Hide from feed',
}: CardActionsSheetProps) {
  const router = useRouter();
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  const sourceLink = item != null ? sourceLinkFor(item) : undefined;

  return (
    <Sheet onClose={onClose} open={open && item != null}>
      {item != null && (
        <>
          {/* Poster beside the title: the dialog is opened from a long-press
              with no page transition, so the artwork is what confirms *which*
              item you grabbed. */}
          <View className="flex-row items-center gap-4">
            <SheetPoster item={item} />
            <View className="flex-1">
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
            </View>
          </View>

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
          {sourceLink != null && (
            <PresstableOpacity
              className="flex-row items-center gap-3 rounded px-5 py-3 mt-2 border border-border"
              onPress={() => {
                haptics.selection();
                void openExternalUrl(sourceLink.url);
                // A new tab steals focus on web — closing the sheet here would
                // animate it shut in a now-backgrounded tab, which reads as
                // broken when the user switches back. Native's in-app browser
                // has no such background reflow, so it closes right after
                // opening, like every other action row.
                if (process.env.EXPO_OS !== 'web') onClose();
              }}
            >
              <ProviderIcon id={sourceLink.provider} size={18} />
              <Text className="text-foreground font-sans-semibold text-base flex-1">
                View on {PROVIDERS[sourceLink.provider].label}
              </Text>
              <Ionicons color={mutedColor} name="open-outline" size={16} />
            </PresstableOpacity>
          )}
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
              {hideLabel}
            </Text>
          </PresstableOpacity>
        </>
      )}
    </Sheet>
  );
}
