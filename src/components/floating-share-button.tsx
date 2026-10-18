import Ionicons from '@react-native-vector-icons/ionicons/static';

import { useFloatingBackButtonTop } from '@/components/floating-back-button';
import { RoundIconButton } from '@/components/round-icon-button';
import { shareLink } from '@/components/share-button';
import { useThemeColor } from '@/lib/theme-color';

export function FloatingShareButton({ href }: { href: string }) {
  const top = useFloatingBackButtonTop();
  const foreground = useThemeColor('--color-foreground');

  return (
    <RoundIconButton
      className="absolute right-4"
      icon={<Ionicons color={foreground} name="share-outline" size={20} />}
      label="Share"
      onPress={() => void shareLink(href)}
      style={{ top }}
    />
  );
}
