import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { MorphText } from '@/components/morph-text';
import { ProgressRing } from '@/components/progress-ring';
import type { useMediaProgress } from '@/state/queries/media-progress';

/** Loaded titles only: an unrequested next page is never silently counted as unwatched. */
export function ListProgress({ state, countLabel, partial = false }: { state: ReturnType<typeof useMediaProgress>; countLabel: string; partial?: boolean }) {
  const { items, progress, connected, loading, failed, incomplete, retry } = state;
  const films = items.every((item) => item.type === 'MOVIE' || item.isFilm === true);
  const completed = progress.filter((entry) => entry.completed).length;
  const started = progress.filter((entry) => entry.watched && !entry.completed).length;
  const label = `${incomplete ? 'At least ' : ''}${completed} of ${items.length}${partial ? ' loaded' : ''} ${films ? 'watched' : 'completed'}`;
  const ready = connected && items.length > 0 && !loading && !failed;
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2" accessibilityLabel={`${ready ? label : countLabel}${started > 0 ? ` · ${started} started` : ''}`}>
        {connected && items.length > 0 && <ProgressRing label={loading ? 'Checking watch history' : label} max={items.length} value={completed} />}
        <MorphText className="font-sans text-sm text-muted tabular-nums">{ready ? `${completed}${incomplete ? '+' : ''}/${countLabel}` : countLabel}</MorphText>
      </View>
      {(failed || incomplete) && (
        <View className="flex-row items-center gap-1.5">
          <Text className="font-sans text-xs text-muted">Incomplete history</Text>
          {failed && <Button icon={<Button.Icon name="refresh" />} label="Retry" loading={loading} onPress={() => void retry()} size="sm" variant="quiet" />}
        </View>
      )}
    </View>
  );
}
