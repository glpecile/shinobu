import { Button } from '@/components/button';
import { haptics } from '@/lib/haptics';

import type { ViewToggleProps } from './props';

/** A compact native action showing the layout it switches to. */
export function ViewToggle({ view, onChange, size }: ViewToggleProps) {
  const next = view === 'grid' ? 'list' : 'grid';

  return (
    <Button
      icon={<Button.Icon name={next === 'grid' ? 'grid-outline' : 'list-outline'} />}
      iconOnly
      label={next === 'grid' ? 'Switch to poster grid' : 'Switch to list'}
      onPress={() => {
        haptics.selection();
        onChange(next);
      }}
      size={size}
      variant="quiet"
    />
  );
}
