import { View } from 'react-native';

import { Button } from '@/components/button';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { useIsWatchlisted } from '@/features/watchlist/use-is-watchlisted';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import type { ProviderId } from '@/lib/providers/types';
import type { ProviderFailure } from '@/state/queries/settle';
import { useConnectedProviders } from '@/state/session';

import {
  isUnwatchlistCtaSettled,
  unwatchlistCtaCopy,
  watchlistResultView,
} from './copy';
import { splitWatchlistRemoveTargets } from './remove-targets';
import {
  useIsUnwatchlistPending,
  useLatestUnwatchlistResult,
} from './use-unwatchlist-media';

export function UnwatchlistMediaButton({
  entry,
  errors = [],
  incomplete = [],
  onOpenPicker,
  className,
}: {
  entry: WatchlistEntry;
  className?: string;
  errors?: readonly ProviderFailure[];
  incomplete?: readonly ProviderId[];
  onOpenPicker: () => void;
}) {
  const connected = useConnectedProviders();
  const letterboxdUserscript = useLetterboxdUserscript('watchlist-remove');
  const pending = useIsUnwatchlistPending(entry.item.id);
  const result = useLatestUnwatchlistResult(entry.item.id);

  const onList = useIsWatchlisted(entry.item);

  const split = splitWatchlistRemoveTargets(
    entry.item,
    entry.sources,
    connected,
    currentPlatform(),
    errors,
    incomplete,
    letterboxdUserscript,
  );

  const copy = unwatchlistCtaCopy(entry.item);
  const view = result == null ? null : watchlistResultView(result, entry.item);
  const unknown = result?.unknown ?? split.unknown;
  const settled = isUnwatchlistCtaSettled(onList, view, unknown);

  if (
    split.targets.length === 0 &&
    split.manual.length === 0 &&
    unknown.length === 0
  ) {
    return null;
  }

  function openPicker() {
    if (pending || settled) return;
    haptics.selection();
    onOpenPicker();
  }

  return (
    <View className={cn('mb-6', className)}>
      <Button
        disabled={settled}
        icon={<Button.Icon name={settled ? 'bookmark-outline' : 'bookmark'} />}
        label={settled ? copy.settled : copy.idle}
        loading={pending}
        loadingLabel={copy.pending}
        morphLabel
        onPress={openPicker}
        variant="quiet"
      />
    </View>
  );
}
