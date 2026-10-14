import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/button';
import { haptics } from '@/lib/haptics';
import { DURATION, EASE_OUT } from '@/lib/motion';

const HEART_POP = {
  from: { transform: [{ scale: 1 }] },
  '45%': { transform: [{ scale: 1.18 }] },
  to: { transform: [{ scale: 1 }] },
};

/** Controlled like toggle: stage a diary field or bind a provider mutation. */
export function LikeButton({
  liked,
  onChange,
  label,
  loading = false,
  disabled = false,
  size = 'md',
  variant = 'outline',
}: {
  liked: boolean | undefined;
  onChange: (liked: boolean) => void;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  size?: ButtonSize;
  variant?: 'outline' | 'ghost' | 'quiet';
}) {
  const reduceMotion = useReducedMotion();
  let buttonVariant: ButtonVariant;
  switch (variant) {
    case 'quiet': buttonVariant = liked ? 'quiet-accent' : 'quiet'; break;
    case 'ghost': buttonVariant = liked ? 'accent-ghost' : 'ghost'; break;
    case 'outline': buttonVariant = liked ? 'outline' : 'quiet'; break;
  }
  return (
    <Button
      disabled={disabled}
      icon={
        <AnimatedView style={{
          animationName: liked && !reduceMotion ? HEART_POP : undefined,
          animationDuration: DURATION.swap,
          animationTimingFunction: EASE_OUT,
        }}>
          <Button.Icon name={liked == null ? 'help-circle-outline' : liked ? 'heart' : 'heart-outline'} />
        </AnimatedView>
      }
      iconOnly
      label={label}
      loading={loading}
      onPress={() => {
        haptics.selection();
        onChange(!liked);
      }}
      pressed={liked}
      size={size}
      variant={buttonVariant}
    />
  );
}
