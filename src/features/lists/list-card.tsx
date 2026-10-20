import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { OverlayActionsButton } from '@/components/overlay-actions-button';
import { PresstableScale } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { useNewTabPress } from '@/components/use-new-tab-press';
import { useThemeColor } from '@/lib/theme-color';
import { listMeta, type ListSummary } from './list-summary';
import { PosterStack } from './poster-stack';

/**
 * Title and meta are one line each, so a card's height follows from its width:
 * mt-2.5 + text-sm's 20 line + mt-1 + text-xs's 16 line. Short, and the rail scrolls vertically.
 */
export const LIST_CARD_TEXT_HEIGHT = 50;

/** A fanned poster stack over one-line title and meta; long-press opens the list sheet. */
export function ListCard({ list, onPress, onActions }: {
  list: ListSummary;
  onPress: () => void;
  onActions: (list: ListSummary) => void;
}) {
  const newTab = useNewTabPress(list.href);
  // JS hover, as the person card's: uniwind has no `group-hover:`.
  const [hovered, setHovered] = useState(false);
  return (
    <View onPointerDown={newTab.onPointerDown} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <PresstableScale
        accessibilityLabel={`${list.title}. ${listMeta(list)}`}
        accessibilityRole="button"
        minScale={0.98}
        onLongPress={() => onActions(list)}
        onPress={() => { if (!newTab.opened()) onPress(); }}
      >
        <PosterStack previews={list.previews} />
        <Text className="text-foreground font-sans-semibold text-sm mt-2.5" numberOfLines={1}>{list.title}</Text>
        <View className="flex-row items-center gap-2 mt-1">
          <Text className="text-muted font-sans text-xs flex-1" numberOfLines={1}>
            {list.count === '' ? 'by ' : `${list.count} · by `}
            <Text className="text-foreground/80 font-sans-semibold">{list.owner}</Text>
          </Text>
          <ProviderIcon id={list.provider} size={12} />
        </View>
      </PresstableScale>
      {/* A sibling, not a child: a ⋯ press must not bubble into the card's. */}
      {process.env.EXPO_OS === 'web' && (
        <OverlayActionsButton className="absolute top-1.5 right-1.5" label={`More about ${list.title}`} onPress={() => onActions(list)} size="lg" visible={hovered} />
      )}
    </View>
  );
}

/** The created index's and rail's first card: an empty stack that opens the editor. */
export function NewListCard({ provider, onPress }: { provider: ListSummary['provider']; onPress: () => void }) {
  const muted = useThemeColor('--color-muted');
  return (
    <PresstableScale accessibilityLabel="New list" accessibilityRole="button" minScale={0.98} onPress={onPress}>
      <PosterStack previews={[]}>
        <View className="w-12 h-12 rounded-full bg-background border border-border items-center justify-center">
          <Ionicons color={muted} name="add" size={26} />
        </View>
      </PosterStack>
      <Text className="text-foreground font-sans-semibold text-sm mt-2.5" numberOfLines={1}>New list</Text>
      <View className="flex-row items-center gap-2 mt-1">
        <Text className="text-muted font-sans text-xs flex-1" numberOfLines={1}>{provider === 'letterboxd' ? 'Films, ranked or not' : 'Shows, ranked or not'}</Text>
        <ProviderIcon id={provider} size={12} />
      </View>
    </PresstableScale>
  );
}
