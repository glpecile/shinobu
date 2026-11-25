import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Spinner } from '@/components/spinner';

import { PresstableOpacity } from '@/components/presstable';
import { Rail } from '@/components/rail';
import { useLinkHandoff } from '@/lib/open-external-url/use-link-handoff';
import { useThemeColor } from '@/lib/theme-color';

/** When `children` is provided, it replaces the visible text and `label` is used only for accessibility. */
export function LinkPill({
  icon,
  label,
  external = false,
  onPress,
  children,
}: {
  icon?: ReactNode;
  label: string;
  children?: ReactNode;
  external?: boolean;
  onPress?: () => void | Promise<void>;
}) {
  const muted = useThemeColor('--color-muted');
  const { loading, open } = useLinkHandoff(() => onPress?.());

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
    <PresstableOpacity
      className="rounded-full"
      accessibilityRole="button"
      accessibilityLabel={children != null ? label : undefined}
      accessibilityState={{ busy: loading, disabled: loading }}
      aria-busy={loading}
      aria-disabled={loading}
      disabled={loading}
      onPress={external ? open : onPress}
    >
      {content}
    </PresstableOpacity>
  );
}

function LinkPillRail({ children }: { children: ReactNode }) {
  return <Rail contentContainerClassName="gap-2">{children}</Rail>;
}

LinkPill.Rail = LinkPillRail;
