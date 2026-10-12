import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { MorphText } from '@/components/morph-text';
import { ProgressRing } from '@/components/progress-ring';
import { useMediaProgress } from '@/state/queries/media-progress';
import type { NormalizedMediaItem } from '@/types/media';

/** Loaded titles only: an unrequested next page is never silently counted as unwatched. */
export function ListProgress({ items, countLabel, partial = false }: { items: readonly NormalizedMediaItem[]; countLabel: string; partial?: boolean }) {
  const { progress, connected, loading, failed, retry } = useMediaProgress(items);
  const films = items.every((item) => item.type === 'MOVIE' || item.isFilm === true);
  const completed = progress.filter((state) => state.completed).length;
  const started = progress.filter((state) => state.watched && !state.completed).length;
  const label = `${completed} of ${items.length}${partial ? ' loaded' : ''} ${films ? 'watched' : 'completed'}`;
  const ready = connected && items.length > 0 && !loading && !failed;
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2" accessibilityLabel={`${ready ? label : countLabel}${started > 0 ? ` · ${started} started` : ''}`}>
        {connected && items.length > 0 && <ProgressRing label={loading ? 'Checking watch history' : label} max={items.length} value={completed} />}
        <MorphText className="font-sans text-sm text-muted tabular-nums">{ready ? `${completed}/${countLabel}` : countLabel}</MorphText>
      </View>
      {failed && (
        <View className="flex-row items-center gap-1.5">
          <Text className="font-sans text-xs text-muted">Incomplete history</Text>
          <Button icon={<Button.Icon name="refresh" />} label="Retry" loading={loading} onPress={() => void retry()} size="sm" variant="quiet" />
        </View>
      )}
    </View>
  );
}
