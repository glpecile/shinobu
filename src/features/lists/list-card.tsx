import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { OverlayActionsButton } from '@/components/overlay-actions-button';
import { PresstableScale } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { useNewTabPress } from '@/components/use-new-tab-press';
import { Provider } from '@/lib/providers/types';
import { useThemeColor } from '@/lib/theme-color';
import { listMeta, type ListSummary } from './list-summary';
import { PosterStack } from './poster-stack';

export const LIST_CARD_TEXT_HEIGHT = 50;

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
      {process.env.EXPO_OS === 'web' && (
        <OverlayActionsButton className="absolute top-1.5 right-1.5" label={`More about ${list.title}`} onPress={() => onActions(list)} size="lg" visible={hovered} />
      )}
    </View>
  );
}

function newListNote(provider: ListSummary['provider']) {
  switch (provider) {
    case Provider.Letterboxd:
      return 'Films, ranked or not';
    case Provider.Serializd:
      return 'Shows, ranked or not';
    case Provider.Hardcover:
      return 'Books, ranked or not';
  }
}

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
        <Text className="text-muted font-sans text-xs flex-1" numberOfLines={1}>{newListNote(provider)}</Text>
        <ProviderIcon id={provider} size={12} />
      </View>
    </PresstableScale>
  );
}
