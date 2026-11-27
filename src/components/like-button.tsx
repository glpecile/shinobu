import { Button, type ButtonSize } from '@/components/button';
import { haptics } from '@/lib/haptics';

export function LikeButton({
  liked,
  onChange,
  label,
  loading = false,
  disabled = false,
  size = 'md',
  variant = 'quiet',
}: {
  liked: boolean | undefined;
  onChange: (liked: boolean) => void;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  size?: ButtonSize;
  variant?: 'quiet' | 'ghost';
}) {
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
      variant={variant}
    />
  );
}
