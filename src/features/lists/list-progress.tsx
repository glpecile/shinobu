import { View } from 'react-native';

import { Button } from '@/components/button';
import { MorphText } from '@/components/morph-text';
import { ProgressRing } from '@/components/progress-ring';
import { Spinner } from '@/components/spinner';
import { Tooltip } from '@/components/tooltip';
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
    <View className="flex-row flex-wrap items-center gap-2">
      <Tooltip label={loading ? 'Checking watch history' : ready ? label : countLabel}>
        <View accessible className="flex-row items-center gap-2" accessibilityLabel={`${loading ? 'Checking watch history. ' : ''}${ready ? label : countLabel}${started > 0 ? ` · ${started} started` : ''}`}>
          {(ready || loading) && <View className="size-5 items-center justify-center">
            {loading ? <Spinner /> : <ProgressRing label={label} max={items.length} value={completed} />}
          </View>}
          <MorphText className="font-sans text-sm text-muted tabular-nums">{ready ? `${completed}/${countLabel}` : countLabel}</MorphText>
        </View>
      </Tooltip>
      {failed && !loading && <Tooltip label="Couldn’t check watch history. Retry"><Button icon={<Button.Icon name="refresh" />} iconOnly label="Retry watch history" onPress={() => void retry()} size="sm" variant="ghost" /></Tooltip>}
    </View>
  );
}
