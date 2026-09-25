import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { useThemeColor } from '@/lib/theme-color';

/** A bordered pill that opens something; `external` marks a link that leaves the app. */
export function LinkPill({
  icon,
  label,
  external = false,
  onPress,
  onLongPress,
}: {
  icon?: ReactNode;
  label: string;
  external?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const muted = useThemeColor('--color-muted');
  return (
    <PresstableOpacity
      className="rounded-full"
      onLongPress={onLongPress}
      onPress={onPress}
    >
      {/* The box sits on an inner View: a border on the pressable is never drawn
          on Android (docs/solutions/pressto-border-not-drawn-on-android.md). */}
      <View className="flex-row items-center gap-2 bg-surface border border-border rounded-full px-4 py-2">
        {icon}
        <Text className="text-foreground font-sans text-sm">{label}</Text>
        {external && <Ionicons color={muted} name="open-outline" size={12} />}
      </View>
    </PresstableOpacity>
  );
}

/**
 * One scrolling row of `LinkPill`s, so a section of them stays one line tall
 * however many there are. `nestedScrollEnabled`: on Android the episode pager
 * otherwise takes every horizontal drag that starts on the row.
 */
function LinkPillRail({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      contentContainerClassName="gap-2"
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

LinkPill.Rail = LinkPillRail;
