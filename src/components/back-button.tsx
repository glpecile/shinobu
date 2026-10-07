import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ComponentProps } from 'react';

import { RoundIconButton } from '@/components/round-icon-button';
import { useThemeColor } from '@/lib/theme-color';

/** One Back glyph and shape, whether it floats over art or sits in a header. */
export function BackButton(
  props: Omit<ComponentProps<typeof RoundIconButton>, 'icon' | 'label'>,
) {
  const foreground = useThemeColor('--color-foreground');
  return (
    <RoundIconButton
      {...props}
      icon={<Ionicons color={foreground} name="arrow-back" size={20} />}
      label="Back"
    />
  );
}
