import { useAppIcon } from '@hzblj/expo-app-icons';
import { Text, useColorScheme } from 'react-native';
import { Image } from '@/components/image';
import { RailHead } from '@/components/rail-head';
import { PreviewPicker } from '@/features/settings/preview-picker';
import { SettingsRail } from '@/features/settings/settings-rail';
import { toast } from '@/lib/toast';

const OPTIONS: { value: string; label: string; source: number }[] = [
  { value: 'default', label: 'Automatic', source: require('../../../assets/images/icon.png') },
  {
    value: 'crimson',
    label: 'Kiss-shot',
    source: require('../../../assets/images/app-icons/crimson.png'),
  },
  { value: 'void', label: 'Acerola', source: require('../../../assets/images/app-icons/void.png') },
  { value: 'weird', label: 'Orion', source: require('../../../assets/images/app-icons/weird.png') },
];
const DEFAULT_DARK_SOURCE = require('../../../assets/images/ios-icon-dark.png');

export function AppIconSection() {
  const { icon: current, isSupported, setIcon } = useAppIcon();
  const dark = useColorScheme() === 'dark';
  if (!isSupported) return null;

  const label = OPTIONS.find((option) => option.value === current)?.label ?? 'Automatic';

  async function select(next: string) {
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
        <PreviewPicker
          label="App icon"
          onSelect={(next) => void select(next)}
          value={current ?? 'default'}
        >
          {OPTIONS.map((option) => (
            <PreviewPicker.Option key={option.value} value={option.value}>
              <PreviewPicker.Preview>
                <Image
                  className="aspect-square w-full"
                  source={dark && option.value === 'default' ? DEFAULT_DARK_SOURCE : option.source}
                  transition={0}
                />
              </PreviewPicker.Preview>
              <PreviewPicker.Label>{option.label}</PreviewPicker.Label>
            </PreviewPicker.Option>
          ))}
        </PreviewPicker>
      </SettingsRail.Row>
      {process.env.EXPO_OS === 'android' && (
        <SettingsRail.Row>
          <Text className="flex-1 font-sans text-xs text-muted">
            The icon changes when you leave the app.
          </Text>
        </SettingsRail.Row>
      )}
    </SettingsRail.Section>
  );
}
