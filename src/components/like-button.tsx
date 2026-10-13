import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Button, type ButtonSize } from '@/components/button';
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
}: {
  liked: boolean;
  onChange: (liked: boolean) => void;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  size?: ButtonSize;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <Button
      disabled={disabled}
      icon={
        <AnimatedView style={{
          animationName: liked && !reduceMotion ? HEART_POP : undefined,
          animationDuration: DURATION.swap,
          animationTimingFunction: EASE_OUT,
        }}>
          <Button.Icon name={liked ? 'heart' : 'heart-outline'} />
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
      variant={liked ? 'outline' : 'quiet'}
    />
  );
}
