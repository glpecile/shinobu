import { Button, type ButtonSize, type ButtonVariant } from '@/components/button';
import { haptics } from '@/lib/haptics';

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
  let buttonVariant: ButtonVariant;
  switch (variant) {
    case 'quiet': buttonVariant = liked ? 'quiet-accent' : 'quiet'; break;
    case 'ghost': buttonVariant = liked ? 'accent-ghost' : 'ghost'; break;
    case 'outline': buttonVariant = liked ? 'outline' : 'quiet'; break;
  }
  return (
    <Button
      disabled={disabled}
      icon={<Button.Icon name={liked ? 'heart' : 'heart-outline'} />}
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
