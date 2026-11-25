import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/button';
import {
  findWatchlistRemoval,
  type WatchlistRemovalTarget,
} from '@/features/watchlist/find-watchlist-removal';
import { useIsWatchlisted } from '@/features/watchlist/use-is-watchlisted';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { HardcoverStatus } from '@/lib/providers/hardcover/reads';
import { Provider } from '@/lib/providers/types';
import { cachedMangaList, useAniListEntryStateQuery } from '@/state/queries/anilist';
import { useHardcoverBookEntryQuery } from '@/state/queries/hardcover';
import { watchlistQueryKeys, type WatchlistInputs } from '@/state/queries/watchlist';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import {
  isReadIntent,
  isWatchlistCtaSettled,
  watchlistCtaCopy,
  watchlistResultView,
} from './copy';
import { useWriteTargetsSplit } from './targets';
import {
  WatchlistAddPickerSheet,
  WatchlistRemovePickerSheet,
} from './watchlist-picker-sheet';
import { useWatchlistAddStillOffered } from './use-watchlist-add-offered';
import {
  useIsWatchlistWritePending,
  useLatestWatchlistResult,
} from './use-watchlist-media';

export function WatchlistMediaButton({
  item,
  onOpenPicker,
  className,
}: {
  item: NormalizedMediaItem;
  className?: string;
  onOpenPicker?: () => void;
}) {
  const queryClient = useQueryClient();
  const pending = useIsWatchlistWritePending(item.id);
  const result = useLatestWatchlistResult(item.id);
  const [open, setOpen] = useState(false);
  const [openNonce, setOpenNonce] = useState(0);
  const [removal, setRemoval] = useState<WatchlistRemovalTarget | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const onList = useIsWatchlisted(item);
  const stillOffered = useWatchlistAddStillOffered(item);

  const copy = watchlistCtaCopy(item);
  const view = result == null ? null : watchlistResultView(result, item);
  const settled = isWatchlistCtaSettled(onList, view, stillOffered);

  function openRemovePicker() {
    const data = queryClient.getQueryData<WatchlistInputs>(
      watchlistQueryKeys.inputs(),
    );
    const target = data == null ? null : findWatchlistRemoval(data, item, cachedMangaList(queryClient));
    if (target == null) return;
    haptics.selection();
    setRemoval(target);
    // A new key per open: the native sheet keeps its picker mounted while
    // closed, so a reopen would land on the last step it showed.
    setOpenNonce((nonce) => nonce + 1);
    setRemoveOpen(true);
  }

  function openPicker() {
    if (pending) return;
    if (settled) {
      if (onOpenPicker == null) openRemovePicker();
      return;
    }
    haptics.selection();
    if (onOpenPicker != null) {
      onOpenPicker();
      return;
    }
    setOpenNonce((nonce) => nonce + 1);
    setOpen(true);
  }

  return (
    <View className={cn('mb-6', className)}>
      <Button
        disabled={settled && onOpenPicker != null}
        icon={<Button.Icon name={settled ? 'bookmark' : 'bookmark-outline'} />}
        label={settled ? copy.settled : copy.idle}
        loading={pending}
        loadingLabel={copy.pending}
        morphLabel
        onPress={openPicker}
        variant="quiet"
      />
      {onOpenPicker == null && (
        <WatchlistAddPickerSheet
          item={item}
          key={openNonce}
          onClose={() => setOpen(false)}
          open={open}
        />
      )}
      {onOpenPicker == null && removal != null && (
        <WatchlistRemovePickerSheet
          entry={removal.entry}
          errors={removal.errors}
          incomplete={removal.incomplete}
          key={`remove-${openNonce}`}
          onClose={() => setRemoveOpen(false)}
          open={removeOpen}
        />
      )}
    </View>
  );
}

export function useWatchlistCtaShown(item: NormalizedMediaItem): boolean {
  const { writable, manual } = useWriteTargetsSplit(item, 'watchlist');
  const connected = useConnectedProviders();
  const anilistEntry = useAniListEntryStateQuery({
    type: item.type,
    mediaId: item.externalIds.anilist,
    enabled: isReadIntent(item) && connected.includes(Provider.AniList),
  });
  const trackedManga =
    isReadIntent(item) &&
    anilistEntry.data?.entry != null &&
    anilistEntry.data.entry.status !== 'PLANNING';
  const hardcoverEntry = useHardcoverBookEntryQuery({
    bookId: item.externalIds.hardcover,
    enabled: connected.includes(Provider.Hardcover),
  });
  const trackedBook =
    hardcoverEntry.data != null && hardcoverEntry.data.statusId !== HardcoverStatus.WantToRead;
  return (writable.length > 0 || manual.length > 0) && !trackedManga && !trackedBook;
}
