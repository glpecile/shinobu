import Ionicons from '@react-native-vector-icons/ionicons/static';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { routes } from '@/lib/routes';

/** Persistent desktop navigation for every route outside the home feed. */
export function WebNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const foreground = useCSSVariable('--color-foreground');
  const background = useCSSVariable('--color-background');
  const iconColor = typeof foreground === 'string' ? foreground : undefined;
  const backgroundColor = typeof background === 'string' ? background : 'transparent';

  if (pathname === routes.home) return null;

  return (
    <View className="h-16 relative z-10">
      <View className="h-16 flex-row items-center justify-between px-6 bg-background">
        <PresstableOpacity
          accessibilityLabel="Home"
          className="flex-row items-center"
          onPress={() => router.replace(routes.home)}
        >
          <Text className="text-2xl font-display text-foreground tracking-tight">
            忍 Shinobu
          </Text>
        </PresstableOpacity>
        <View className="flex-row gap-3">
          <PresstableOpacity
            accessibilityLabel="Search"
            className="w-10 h-10 items-center justify-center rounded-full bg-surface border border-border"
            onPress={() => router.push(routes.search)}
          >
            <Ionicons color={iconColor} name="search-outline" size={20} />
          </PresstableOpacity>
          <PresstableOpacity
            accessibilityLabel="Manage trackers"
            className="w-10 h-10 items-center justify-center rounded-full bg-surface border border-border"
            onPress={() => router.push(routes.connect)}
          >
            <Ionicons color={iconColor} name="settings-outline" size={20} />
          </PresstableOpacity>
        </View>
      </View>
      <LinearGradient
        className="absolute -bottom-6 h-6 left-0 right-0"
        colors={[backgroundColor, 'transparent']}
        pointerEvents="none"
      />
    </View>
  );
}
