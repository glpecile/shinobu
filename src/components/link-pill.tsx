import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Spinner } from '@/components/spinner';

import { OverlayActionsButton } from '@/components/overlay-actions-button';
import { PresstableOpacity } from '@/components/presstable';
import { Rail } from '@/components/rail';
import { useLinkHandoff } from '@/lib/open-external-url/use-link-handoff';
import { useThemeColor } from '@/lib/theme-color';

/**
 * A bordered pill that opens something; `external` marks a link that leaves the app.
 *
 * `onActions` is the long-press action, surfaced on web as a hover ⋯ (an
 * `OverlayActionsButton` straddling the pill's top-right corner, like the
 * person card's): web has no long-press, so without it the sheet behind a
 * studio pill would be unreachable there.
 */
export function LinkPill({
  icon,
  label,
  external = false,
  onPress,
  onLongPress,
  onActions,
  actionsLabel,
}: {
  icon?: ReactNode;
  label: string;
  external?: boolean;
  onPress: () => void | Promise<void>;
  onLongPress?: () => void;
  onActions?: () => void;
  actionsLabel?: string;
}) {
  const muted = useThemeColor('--color-muted');
  const { loading, open } = useLinkHandoff(onPress);
  // JS hover state, not CSS: uniwind has no `group-hover:` support, so the
  // web-only ⋯ reveal rides on RN-web's pointer events instead.
  const [hovered, setHovered] = useState(false);
  const showActionsButton =
    process.env.EXPO_OS === 'web' && onActions != null && hovered;

  return (
    <View
      className="relative"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
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
      {showActionsButton && (
        <OverlayActionsButton
          className="absolute -top-3 -right-3"
          label={actionsLabel ?? `More options for ${label}`}
          onPress={onActions}
          size="sm"
        />
      )}
    </View>
  );
}

/**
 * One scrolling row of `LinkPill`s, so a section of them stays one line tall
 * however many there are. The web-only ⋯ straddles each pill's top corner, so
 * the rail carries top padding on web to keep it from clipping.
 */
function LinkPillRail({ children }: { children: ReactNode }) {
  return <Rail contentContainerClassName="gap-2 web:pt-3">{children}</Rail>;
}

LinkPill.Rail = LinkPillRail;
