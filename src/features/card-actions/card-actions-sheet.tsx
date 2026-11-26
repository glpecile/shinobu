import Ionicons from '@react-native-vector-icons/ionicons/static';
import { type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Button } from '@/components/button';
import { PresstableOpacity } from '@/components/presstable';
import { SmallPoster } from '@/components/small-poster';
import { ShareButton } from '@/components/share-button';
import { Sheet } from '@/components/sheet';
import { SheetHeader } from '@/components/sheet-header';
import { alternateTitles, CopyTitleOptions } from '@/features/copy-title/copy-title';
import { MoreActions, MoreActionsCapsule } from './more-actions';
import { AddToListPicker } from '@/features/lists/add-to-list-picker';
import { ListMembershipForm } from '@/features/lists/list-membership-form';
import type { ListEditTarget } from '@/state/queries/list-membership';
import { LogMediaButton } from '@/features/log-media/log-media-button';
import type { LogRequest } from '@/features/log-media/log-request';
import { needsReleaseEnrichment, watchlistCtaIsPrimary } from '@/features/log-media/release-gate';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import { useSeriesNextEpisode } from '@/features/log-media/use-series-next-episode';
import { LogSheetContent } from '@/features/log-media/session/catch-up-log-sheet';
import { PersonAvatar } from '@/features/person/person-avatar';
import { creditRoleLine, type PersonCredit } from '@/features/person/person-credit-sheet';
import { TvCreditLine } from '@/features/person/tv-credit-line';
import { shouldOfferWatchlistAdd } from '@/features/watchlist-media/remove-targets';
import { UnwatchlistMediaButton } from '@/features/watchlist-media/unwatchlist-media-button';
import {
  useWatchlistCtaShown,
  WatchlistMediaButton,
} from '@/features/watchlist-media/watchlist-media-button';
import {
  WatchlistAddPicker,
  WatchlistRemovePicker,
} from '@/features/watchlist-media/watchlist-picker-sheet';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { useCachedWatchlistRemoval } from '@/features/watchlist/use-cached-watchlist-removal';
import { ProviderLinkRow } from '@/features/provider-links/provider-link-row';
import { haptics } from '@/lib/haptics';
import { mediaRuntimeMinutes, mediaSortValue } from '@/lib/media-sort';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { applyPrimaryMetadata, mergeCatalogueMetadata } from '@/lib/providers/merge-metadata';
import type { TvCredit } from '@/lib/providers/tmdb/normalize';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { providerLinksFor } from '@/lib/providers/provider-links';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useThemeColor } from '@/lib/theme-color';
import { hideItem } from '@/state/prefs/hidden-items';
import type { ProviderFailure } from '@/state/queries/settle';
import { useConnectedProviders } from '@/state/session';
import { useTraktMediaImages } from '@/state/queries/trakt';
import { useLetterboxdFilmQuery } from '@/state/queries/letterboxd';
import { useMediaDetailsQuery } from '@/state/queries/media-details';
import type { NormalizedMediaItem } from '@/types/media';

export type CardCredit = Pick<PersonCredit, 'name' | 'headshot' | 'role' | 'kind'> & {
  tvCredits?: readonly TvCredit[];
};

interface CardActionsSheetProps {
  listRemoval?: { target: ListEditTarget; entryId?: string; subtitle?: string } | null;
  /** Kept (not nulled) while closing so content doesn't vanish mid-animation. */
  item: NormalizedMediaItem | null;
  open: boolean;
  onClose: () => void;
  hideLabel?: string;
  providerLinks?: 'source' | 'connected';
  canHide?: boolean;
  canWatchlist?: boolean;
  credit?: CardCredit | null;
  watchlistRemoval?: {
    entry: WatchlistEntry;
    errors: readonly ProviderFailure[];
    incomplete: readonly ProviderId[];
  } | null;
}

const runtimeFade = { from: { opacity: 0 }, to: { opacity: 1 } };

function SheetPoster({ item }: { item: NormalizedMediaItem }) {
  const { coverImage } = useTraktMediaImages(item);
  return <SmallPoster uri={coverImage} recyclingKey={item.id} size="lg" />;
}

export function CardActionsSheet({
  item: sourceItem,
  open,
  onClose,
  hideLabel = 'Hide from feed',
  providerLinks = 'source',
  canHide = true,
  canWatchlist = true,
  credit = null,
  watchlistRemoval = null,
  listRemoval = null,
}: CardActionsSheetProps) {
  const pushRoute = usePushRoute();
  const connected = useConnectedProviders();
  const reducedMotion = useReducedMotion();
  const muted = useThemeColor('--color-muted');
  const film = useLetterboxdFilmQuery(open ? (sourceItem?.externalIds.letterboxd ?? null) : null);
  const resolved =
    sourceItem != null && film.data != null
      ? { ...mergeCatalogueMetadata(sourceItem, film.data), tmdbTvVariant: film.data.tmdbTvVariant }
      : sourceItem;
  const details = useMediaDetailsQuery(
    open && (film.data != null || (sourceItem != null && needsReleaseEnrichment(sourceItem)))
      ? (resolved ?? undefined)
      : undefined,
  );
  const item = resolved == null ? null : applyPrimaryMetadata(resolved, details.data?.catalogue);
  const runtime = item == null ? undefined : mediaRuntimeMinutes(item);
  const episodeRuntime = item == null ? undefined : mediaSortValue(item, 'runtime');
  const isSeries = item?.type === 'TV' || (item?.type === 'ANIME' && !item.isFilm);
  const runtimeLabel = isSeries
    ? [
        episodeRuntime == null ? null : `${Math.round(episodeRuntime)} min/episode`,
        runtime == null ? null : `${Math.round(runtime)} min total`,
      ]
        .filter(Boolean)
        .join(' · ')
    : runtime == null
      ? ''
      : `${Math.round(runtime)} min`;
  const itemId = item?.id;
  const [chosen, setChosen] = useState<{
    mode:
      | 'actions'
      | 'copy-title'
      | 'watchlist-add'
      | 'watchlist-remove'
      | 'log'
      | 'list-remove'
      | 'list-add'
      | 'more';
    open: boolean;
    itemId: string | undefined;
  }>({ mode: 'actions', open, itemId });
  if (chosen.open !== open || chosen.itemId !== itemId) {
    setChosen({ mode: 'actions', open, itemId });
  }
  const mode = chosen.open === open && chosen.itemId === itemId ? chosen.mode : 'actions';
  const setMode = (next: typeof chosen.mode) => setChosen({ mode: next, open, itemId });
  const [logRequest, setLogRequest] = useState<LogRequest | null>(null);
  const seriesNext = useSeriesNextEpisode(item);
  const links =
    item == null
      ? []
      : providerLinks === 'connected'
        ? providerLinksFor(item, connected)
        : providerLinksFor(item, item.bridgedAniList == null ? [] : [Provider.AniList]);
  const hostRemoval =
    watchlistRemoval != null && watchlistRemoval.entry.item.id === itemId ? watchlistRemoval : null;
  const cachedRemoval = useCachedWatchlistRemoval(
    item,
    open && canWatchlist && hostRemoval == null,
  );
  const removal = hostRemoval ?? cachedRemoval;
  const watchlistVerb = !canWatchlist
    ? null
    : removal != null &&
        (hostRemoval != null ||
          !shouldOfferWatchlistAdd(
            removal.entry,
            connected,
            currentPlatform(),
            removal.errors,
            removal.incomplete,
          ))
      ? 'remove'
      : 'add';

  return (
    <Sheet onClose={onClose} open={open && item != null}>
      {item != null && mode === 'list-add' && (
        <AddToListPicker item={item} onBack={() => setMode('actions')} onClose={onClose} />
      )}
      {item != null && mode === 'more' && (
        <MoreActions
          item={item}
          key={`more-${item.id}`}
          onBack={() => setMode('actions')}
          onClose={onClose}
        />
      )}
      {item != null && mode === 'list-remove' && listRemoval != null && (
        <ListMembershipForm
          entryId={listRemoval.entryId}
          item={sourceItem ?? item}
          key={`list-remove-${listRemoval.entryId ?? item.id}`}
          onBack={() => setMode('actions')}
          onDone={onClose}
          present={false}
          subtitle={listRemoval.subtitle}
          target={listRemoval.target}
        />
      )}
      {item != null && mode === 'watchlist-add' && (
        <WatchlistAddPicker
          item={item}
          key={`watchlist-add-${item.id}`}
          onCancel={() => setMode('actions')}
          onCleanClose={onClose}
        />
      )}
      {item != null && mode === 'watchlist-remove' && removal != null && (
        <WatchlistRemovePicker
          entry={removal.entry}
          errors={removal.errors}
          incomplete={removal.incomplete}
          key={`watchlist-remove-${item.id}`}
          onCancel={() => setMode('actions')}
          onCleanClose={onClose}
        />
      )}
      {item != null && mode === 'log' && logRequest != null && (
        <LogSheetContent
          key={`log-${logRequest.item.id}-${logRequest.title}`}
          onClose={() => setMode('actions')}
          onDismiss={onClose}
          onOpenRequest={setLogRequest}
          open={open}
          request={logRequest}
        />
      )}
      {item != null && mode === 'copy-title' && (
        <CopyTitleOptions
          alternates={alternateTitles(item)}
          onClose={() => setMode('actions')}
          onCopied={onClose}
          title={item.title}
          tmdbId={item.externalIds.tmdb}
          year={item.year}
        />
      )}
      {item != null && mode === 'actions' && (
        <>
          <SheetHeader>
            <SheetPoster item={item} />
            <SheetHeader.Content>
              <PresstableOpacity
                accessibilityHint="Opens copy options"
                accessibilityRole="button"
                className="min-h-11 justify-center"
                onPress={() => setMode('copy-title')}
              >
                <SheetHeader.Title>{item.title}</SheetHeader.Title>
              </PresstableOpacity>
              <SheetHeader.Subtitle>
                {[item.type, item.year != null ? String(item.year) : null]
                  .filter((part) => part != null)
                  .join(' · ')}
              </SheetHeader.Subtitle>
              {item.type !== 'MANGA' && item.type !== 'BOOK' && (
                <AnimatedView
                  accessible={runtimeLabel !== ''}
                  accessibilityLabel={runtimeLabel}
                  key={`${item.id}-${runtimeLabel}`}
                  className="min-h-5 flex-row items-center gap-1.5 mt-1"
                  style={{
                    animationName: runtimeFade,
                    animationDuration: reducedMotion ? 0 : DURATION.swap,
                    animationTimingFunction: EASE_OUT,
                  }}
                >
                  {runtimeLabel !== '' && (
                    <Ionicons accessible={false} color={muted} name="time-outline" size={14} />
                  )}
                  <Text className="flex-1 text-muted font-sans text-sm">{runtimeLabel}</Text>
                </AnimatedView>
              )}
            </SheetHeader.Content>
          </SheetHeader>

          {credit != null && (
            <View className="mt-4">
              <View className="flex-row items-center gap-3">
                <PersonAvatar
                  className="w-10 h-10 bg-surface"
                  headshot={credit.headshot}
                  name={credit.name}
                  textClassName="text-xs"
                />
                <View className="flex-1">
                  <Text className="text-foreground font-sans-semibold text-sm">{credit.name}</Text>
                  {credit.tvCredits == null && (
                    <Text className="text-muted font-sans text-sm">{creditRoleLine(credit)}</Text>
                  )}
                </View>
              </View>
              {credit.tvCredits != null && (
                <View className="mt-2">
                  {credit.tvCredits.map((tvCredit) => (
                    <TvCreditLine
                      credit={tvCredit}
                      key={tvCredit.creditId}
                      onNavigate={onClose}
                      show={item}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          <View className="mt-5">
            {!watchlistCtaIsPrimary(item) && (
              <LogMediaButton
                item={item}
                key={item.id}
                onOpenRequest={(request) => {
                  setLogRequest(request);
                  setMode('log');
                }}
              />
            )}
            <WatchlistRow item={item} onOpenMode={setMode} removal={removal} verb={watchlistVerb} />
            {item.type === 'TV' && seriesNext.status === 'unavailable' && (
              <Text className="text-muted font-sans text-sm mb-6">
                Episodes are logged per season from the details page.
              </Text>
            )}
          </View>

          <ShareButton.Capsule href={routes.details(item.id, item.type)}>
            <Button
              icon={<Button.Icon name="open-outline" />}
              label="View details"
              onPress={() => {
                onClose();
                pushRoute(routes.details(item.id, item.type));
              }}
              variant="quiet"
            />
          </ShareButton.Capsule>
          {links.map((link) => (
            <ProviderLinkRow className="mt-2" key={link.provider} link={link} onOpened={onClose} />
          ))}
          {listRemoval != null && (
            <Button
              className="mt-2"
              icon={<Button.Icon name="trash-outline" />}
              label="Remove from list"
              onPress={() => setMode('list-remove')}
              variant="quiet-accent"
            />
          )}
          {canHide && (
            <Button
              className="mt-2"
              icon={<Button.Icon name="eye-off-outline" />}
              label={hideLabel}
              onPress={() => {
                haptics.destructive();
                hideItem({ id: item.id, title: item.title, type: item.type });
                onClose();
              }}
              variant="quiet"
            />
          )}
        </>
      )}
    </Sheet>
  );
}

function WatchlistRow({
  item,
  verb,
  removal,
  onOpenMode,
}: {
  item: NormalizedMediaItem;
  verb: 'add' | 'remove' | null;
  removal: CardActionsSheetProps['watchlistRemoval'];
  onOpenMode: (mode: 'watchlist-add' | 'watchlist-remove' | 'list-add' | 'more') => void;
}) {
  let main: ReactNode = null;
  switch (verb) {
    case 'add':
      return <WatchlistAddRow item={item} onOpenMode={onOpenMode} />;
    case 'remove':
      if (removal != null) {
        main = (
          <UnwatchlistMediaButton
            className="mb-0"
            entry={removal.entry}
            errors={removal.errors}
            incomplete={removal.incomplete}
            key={`unwatchlist-${item.id}`}
            onOpenPicker={() => onOpenMode('watchlist-remove')}
          />
        );
      }
      break;
    case null:
      break;
  }
  return (
    <MoreActionsCapsule className="mb-3" item={item} onOpen={onOpenMode}>
      {main}
    </MoreActionsCapsule>
  );
}

function WatchlistAddRow({
  item,
  onOpenMode,
}: {
  item: NormalizedMediaItem;
  onOpenMode: (mode: 'watchlist-add' | 'list-add' | 'more') => void;
}) {
  const ctaShown = useWatchlistCtaShown(item);
  return (
    <MoreActionsCapsule className="mb-3" item={item} onOpen={onOpenMode}>
      {ctaShown ? (
        <WatchlistMediaButton
          className="mb-0"
          item={item}
          key={`watchlist-${item.id}`}
          onOpenPicker={() => onOpenMode('watchlist-add')}
        />
      ) : null}
    </MoreActionsCapsule>
  );
}
