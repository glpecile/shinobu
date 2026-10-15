import { Button } from '@/components/button';

import type { WatchlistView } from '@/state/prefs/watchlist-view';

/** A compact native action showing the layout it switches to. */
export function ViewToggle({
  view,
  onChange,
}: {
  view: WatchlistView;
  onChange: (view: WatchlistView) => void;
}) {
  const next = view === 'grid' ? 'list' : 'grid';

  return (
    <Button
      icon={<Button.Icon name={next === 'grid' ? 'grid-outline' : 'list-outline'} />}
      iconOnly
      label={next === 'grid' ? 'Switch to poster grid' : 'Switch to list'}
      onPress={() => onChange(next)}
      size="sm"
      variant="quiet"
    />
  );
}
