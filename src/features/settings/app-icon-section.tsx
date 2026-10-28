import { useAppIcon } from '@hzblj/expo-app-icons';
import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { PresstableScale } from '@/components/presstable';
import { RailHead } from '@/components/rail-head';
import { SettingsRail } from '@/features/settings/settings-rail';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';

/** Names match app.json; the default icon follows the system appearance. */
const OPTIONS: { value: string; label: string; source: number }[] = [
  { value: 'default', label: 'Shinobu', source: require('../../../assets/images/icon.png') },
  { value: 'crimson', label: 'Kiss-shot', source: require('../../../assets/images/app-icons/crimson.png') },
  { value: 'void', label: 'Acerola', source: require('../../../assets/images/app-icons/void.png') },
  { value: 'weird', label: 'Orion', source: require('../../../assets/images/app-icons/weird.png') },
];

/**
 * App icon setting as a radio group of icon previews. The OS owns the current
 * icon. iOS answers a change with its own alert; Android applies it on background.
 * Renders nothing on web and on devices without alternate icons.
 */
export function AppIconSection() {
  const { icon: current, isSupported, setIcon } = useAppIcon();
  if (!isSupported) return null;

  const label = OPTIONS.find((option) => option.value === current)?.label ?? 'Shinobu';

  async function select(next: string) {
    if (next === current) return;
    haptics.selection();
    try {
      await setIcon(next);
    } catch {
      toast.error('Could not change app icon', 'Try again while Shinobu is open.');
    }
  }

  return (
    <SettingsRail.Section count={label} icon="apps-outline" title="App icon">
      <SettingsRail.Head label={`App icon, ${label}`}>
        <RailHead.Icon name="apps-outline">App icon</RailHead.Icon>
        <RailHead.Count>{label}</RailHead.Count>
      </SettingsRail.Head>
      <SettingsRail.Row>
        <View accessibilityLabel="App icon" accessibilityRole="radiogroup" className="w-full max-w-sm flex-row gap-2.5">
          {OPTIONS.map((option) => {
            const checked = option.value === current;
            return (
              <PresstableScale
                accessibilityLabel={option.label}
                accessibilityRole="radio"
                accessibilityState={{ checked }}
                className="flex-1 items-center gap-2"
                key={option.label}
                onPress={() => void select(option.value)}
                pressBehavior="immediate"
              >
                {/* Transparent when unselected so selecting doesn't shift the layout. */}
                <View className={cn('w-full rounded-2xl border-2 border-transparent p-0.5', checked && 'border-foreground')}>
                  <Image className="aspect-square w-full rounded-xl" source={option.source} transition={0} />
                </View>
                <Text
                  className={cn('font-sans text-sm text-foreground', checked && 'font-sans-semibold')}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </PresstableScale>
            );
          })}
        </View>
      </SettingsRail.Row>
      {process.env.EXPO_OS === 'android' && (
        <SettingsRail.Row>
          <SettingsRail.Subtitle lines={2}>The icon changes when you leave the app.</SettingsRail.Subtitle>
        </SettingsRail.Row>
      )}
    </SettingsRail.Section>
  );
}
