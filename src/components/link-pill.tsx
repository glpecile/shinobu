import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Spinner } from '@/components/spinner';

import { PresstableOpacity } from '@/components/presstable';
import { Rail } from '@/components/rail';
import { useLinkHandoff } from '@/lib/open-external-url/use-link-handoff';
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
  onPress: () => void | Promise<void>;
  onLongPress?: () => void;
}) {
  const muted = useThemeColor('--color-muted');
  const { loading, open } = useLinkHandoff(onPress);
  return (
    <PresstableOpacity
      className="rounded-full"
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      aria-busy={loading}
      aria-disabled={loading}
      disabled={loading}
      onLongPress={onLongPress}
      onPress={external ? open : onPress}
    >
      {/* The box sits on an inner View: a border on the pressable is never drawn
          on Android (docs/solutions/pressto-border-not-drawn-on-android.md). */}
      <View className="flex-row items-center gap-2 bg-surface border border-border rounded-full px-4 py-2">
        {icon}
        <Text className="text-foreground font-sans text-sm">{label}</Text>
        {external && <View className="size-5 items-center justify-center">
          {loading ? <Spinner color={muted} /> : <Ionicons color={muted} name="open-outline" size={12} />}
        </View>}
      </View>
    </PresstableOpacity>
  );
}

/**
 * One scrolling row of `LinkPill`s, so a section of them stays one line tall
 * however many there are.
 */
function LinkPillRail({ children }: { children: ReactNode }) {
  return <Rail contentContainerClassName="gap-2">{children}</Rail>;
}

LinkPill.Rail = LinkPillRail;
