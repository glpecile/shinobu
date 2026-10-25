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
 * `children` replace the label's text when it needs styling (a score and its
 * scale); `label` then only names the pill to assistive tech.
 * Omit `onPress` for a static value without a destination.
 *
 * `onLongPress` doubles as the web hover ⋯ (an `OverlayActionsButton`
 * straddling the pill's top-right corner, like the person card's): web has no
 * long-press, so without it the sheet behind a studio pill would be
 * unreachable there.
 */
export function LinkPill({
  icon,
  label,
  external = false,
  onPress,
  onLongPress,
  children,
}: {
  icon?: ReactNode;
  label: string;
  children?: ReactNode;
  external?: boolean;
  onPress?: () => void | Promise<void>;
  onLongPress?: () => void;
}) {
  const muted = useThemeColor('--color-muted');
  const { loading, open } = useLinkHandoff(() => onPress?.());
  // JS hover state, not CSS: uniwind has no `group-hover:` support, so the
  // web-only ⋯ reveal rides on RN-web's pointer events instead.
  const [hovered, setHovered] = useState(false);
  const webActions =
    process.env.EXPO_OS === 'web' ? onLongPress : undefined;

  // Android needs the border on the inner View, not on pressto's button.
  const content = (
    <View
      accessible={onPress == null}
      accessibilityLabel={onPress == null ? label : undefined}
      className="min-h-11 flex-row items-center gap-2 bg-surface border border-border rounded-full px-4 py-2"
    >
      {icon}
      {children ?? <Text className="text-foreground font-sans text-sm">{label}</Text>}
      {external && onPress != null && <View className="size-5 items-center justify-center">
        {loading ? <Spinner color={muted} /> : <Ionicons color={muted} name="open-outline" size={12} />}
      </View>}
    </View>
  );

  if (onPress == null) return content;

  return (
    <View
      className="relative"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <PresstableOpacity
        className="rounded-full"
        accessibilityRole="button"
        accessibilityLabel={children != null ? label : undefined}
        accessibilityState={{ busy: loading, disabled: loading }}
        aria-busy={loading}
        aria-disabled={loading}
        disabled={loading}
        onLongPress={onLongPress}
        onPress={external ? open : onPress}
      >
        {content}
      </PresstableOpacity>
      {webActions != null && (
        <OverlayActionsButton
          className="absolute -top-3 -right-3"
          label={`More options for ${label}`}
          onPress={webActions}
          size="sm"
          visible={hovered}
        />
      )}
    </View>
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
