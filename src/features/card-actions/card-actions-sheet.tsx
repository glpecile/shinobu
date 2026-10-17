import { useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedText } from '@/components/animated-view';
import { Button } from '@/components/button';
import { SmallPoster } from '@/components/small-poster';
import { Sheet } from '@/components/sheet';
import { SheetHeader } from '@/components/sheet-header';
import { LogMediaButton } from '@/features/log-media/log-media-button';
import type { LogRequest } from '@/features/log-media/log-request';
import { needsReleaseEnrichment, watchlistCtaIsPrimary } from '@/features/log-media/release-gate';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import { useSeriesNextEpisode } from '@/features/log-media/use-series-next-episode';
import { LogSheetContent } from '@/features/log-media/session/catch-up-log-sheet';
import { PersonAvatar } from '@/features/person/person-avatar';
import { creditRoleLine, type PersonCredit } from '@/features/person/person-credit-sheet';
import { shouldOfferWatchlistAdd } from '@/features/watchlist-media/remove-targets';
import { UnwatchlistMediaButton } from '@/features/watchlist-media/unwatchlist-media-button';
import { WatchlistMediaButton } from '@/features/watchlist-media/watchlist-media-button';
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
import type { ProviderId } from '@/lib/providers/types';
import {
  providerLinksFor,
  sourceLinkFor,
} from '@/lib/providers/provider-links';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { hideItem } from '@/state/prefs/hidden-items';
import type { ProviderFailure } from '@/state/queries/settle';
import { useConnectedProviders } from '@/state/session';
import { useTraktMediaImages } from '@/state/queries/trakt';
import { useLetterboxdFilmQuery } from '@/state/queries/letterboxd';
import { useMediaDetailsQuery } from '@/state/queries/media-details';
import type { NormalizedMediaItem } from '@/types/media';

interface CardActionsSheetProps {
  /** Kept (not nulled) while closing so content doesn't vanish mid-animation. */
  item: NormalizedMediaItem | null;
  open: boolean;
  onClose: () => void;
  /**
   * Copy for the hide row, naming the surface the user is looking at
   * ("Hide from diary" on the Diary). Hiding itself is one global set —
   * feed, watchlist, Up Next and diary all read it — reversible from
   * Settings → Hidden items.
   */
  hideLabel?: string;
  /**
   * Which "View on …" rows to offer.
   *
   * `'source'` (default) is the feed/diary contract from plan 0023 R1: one row,
   * for the provider the item *came from*. `'connected'` widens it to every
   * connected provider that can address the item — search results have no
   * meaningful source (they're whichever provider answered the query first), so
   * "open this in the tracker I actually use" is the useful question there.
   */
  providerLinks?: 'source' | 'connected';
  /**
   * Whether to offer the hide row. Off for surfaces whose items aren't feed
   * entries: hiding a *search result* would silently poison the feed for an
   * item the user only looked up.
   */
  canHide?: boolean;
  /**
   * Whether to offer the want-to-watch CTA (plan 0031 R12). Defaults **on** —
   * search, the home feed, person and studio all show items that are plausibly
   * unseen, so they need no opt-in. The diary opts out: every row there is
   * already watched.
   */
  canWatchlist?: boolean;
  /**
   * The watchlist row this sheet was opened from, plus the gather's failed legs
   * (plan 0031 U16/R35). Supplied by `/watchlist`, which already holds the
   * merged entry the grid rendered.
   *
   * **Optional since 2026-08-01**, and no longer the only way to reach the
   * removal: when a surface doesn't supply one, the sheet derives the same
   * target from the gathered cache (`useCachedWatchlistRemoval`). R35 is
   * satisfied by where the `sources` come from — the gather — not by which
   * screen the long-press happened on, and a fully-watchlisted feed card was
   * otherwise rendering a disabled "On your watchlist" row with nothing behind
   * it. An item the gather doesn't hold still yields nothing.
   *
   * Passing it explicitly stays worthwhile for `/watchlist`: the grid's own
   * entry is the row the user is looking at, no merge re-run required.
   */
  /**
   * Why this item is on the page it was long-pressed from: the person whose
   * filmography row it sits in, and their character or job on it (plan 0035
   * R14 put that on the card, clamped to a line — this is where the rest of it
   * lives). Null everywhere else; a feed card has no such context.
   */
  credit?: Pick<PersonCredit, 'name' | 'headshot' | 'role' | 'kind'> | null;
  watchlistRemoval?: {
    entry: WatchlistEntry;
    errors: readonly ProviderFailure[];
    /**
     * Legs that read only part of the list (Letterboxd behind `onEndReached`).
     * Carried for the same R35 reason as `errors`: a film on an unfetched page
     * is absent from `sources` without that being evidence of non-membership.
     */
    incomplete: readonly ProviderId[];
  } | null;
}

const runtimeFade = { from: { opacity: 0 }, to: { opacity: 1 } };

/** The item's artwork, recovered lazily when the log it came from is artless. */
function SheetPoster({ item }: { item: NormalizedMediaItem }) {
  const { coverImage } = useTraktMediaImages(item);
  return <SmallPoster uri={coverImage} recyclingKey={item.id} size="lg" />;
}

/**
 * Per-item actions dialog for the feed, the diary and search: quick log, view
 * details, view on the relevant provider(s), hide. Opened by long-press on a
 * card or row everywhere, plus the hover ⋯ button on web (long-press is not a
 * discoverable web gesture). Quick log reuses
 * `LogMediaButton` wholesale — its form renders here in place of the rows
 * (the watchlist picker's plan 0032 U3 shape, never a second sheet stacked
 * over this one), and clean reports become toasts, so feed logging and
 * details-page logging are one code path. The
 * want-to-watch CTA sits beside it under the same rules (plan 0031 U8) — on by
 * default, off on the diary.
 */
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
}: CardActionsSheetProps) {
  const pushRoute = usePushRoute();
  const connected = useConnectedProviders();
  const reducedMotion = useReducedMotion();
  // List cards carry only a year; resolve the same release date and identity
  // as details before deciding whether logging is available. Letterboxd rows
  // resolve identity first (slug → film record); any other film-like row the
  // gate can't judge yet (Simkl library rows never carry a release date)
  // reads straight through — otherwise a released current-year film hides
  // its log button as `unknown`.
  const film = useLetterboxdFilmQuery(open ? sourceItem?.externalIds.letterboxd ?? null : null);
  const resolved = sourceItem != null && film.data != null
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
    ? [episodeRuntime == null ? null : `${Math.round(episodeRuntime)} min/episode`, runtime == null ? null : `${Math.round(runtime)} min total`].filter(Boolean).join(' · ')
    : runtime == null ? '' : `${Math.round(runtime)} min`;
  /**
   * Which content the one sheet shows (plan 0032 U3): the action rows, a
   * watchlist picker, or the log form — each rendered **in place of** the
   * rows, never a second sheet stacked over this one. Cancel returns to the
   * rows; a clean report fires its toast first, then closes the whole sheet.
   */
  const itemId = item?.id;
  // Remembers which opening chose the mode, so reopening or a new item falls
  // back to the rows.
  const [chosen, setChosen] = useState<{
    mode: 'actions' | 'watchlist-add' | 'watchlist-remove' | 'log';
    open: boolean;
    itemId: string | undefined;
  }>({ mode: 'actions', open, itemId });
  if (chosen.open !== open || chosen.itemId !== itemId) {
    setChosen({ mode: 'actions', open, itemId });
  }
  const mode = chosen.open === open && chosen.itemId === itemId ? chosen.mode : 'actions';
  const setMode = (next: typeof chosen.mode) => setChosen({ mode: next, open, itemId });
  // The log request the `log` mode renders (see `LogMediaButton`'s
  // `onOpenRequest`): set in the same press that enters the mode, so it is
  // never read stale — reopening or a new item falls back to the rows above.
  const [logRequest, setLogRequest] = useState<LogRequest | null>(null);
  // Same read `LogMediaButton` uses (one cache entry, one request): a series
  // whose next episode Trakt can name gets the button, so the pointer to the
  // season picker below is only for the shows that don't.
  const seriesNext = useSeriesNextEpisode(item);
  const links =
    item == null
      ? []
      : providerLinks === 'connected'
        ? providerLinksFor(item, connected)
        : [sourceLinkFor(item)].filter((link) => link != null);
  // The host's entry when it has one for *this* item, otherwise the gather's —
  // so the removal is offered wherever the app actually has evidence of who
  // holds the item, rather than only on `/watchlist` (see the prop's docblock).
  // Null for an item no gathered watchlist names, which is every ordinary feed
  // card. The host's entry is passed independently of `item` and can lag it
  // while the sheet closes, hence the id check; the derived one is a function
  // of `item`, so it never can (and matches across id spaces the host's copy
  // could not — a TMDB-sourced item against a `letterboxd-<slug>` row).
  const hostRemoval =
    watchlistRemoval != null && watchlistRemoval.entry.item.id === itemId
      ? watchlistRemoval
      : null;
  const cachedRemoval = useCachedWatchlistRemoval(
    item,
    open && canWatchlist && hostRemoval == null,
  );
  const removal = hostRemoval ?? cachedRemoval;
  // One watchlist row, never "Add to" stacked on "Remove from". R12 as amended
  // (U16): the add stays offered while some applicable connected provider is
  // still missing the item, so a partially-listed one gets the add — as on the
  // details screen — except on `/watchlist`, whose verb is the removal.
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
          key={`log-${item.id}-${logRequest.title}`}
          onClose={() => setMode('actions')}
          onDismiss={onClose}
          onOpenRequest={setLogRequest}
          open={open}
          request={logRequest}
        />
      )}
      {item != null && mode === 'actions' && (
        <>
          {/* Opened by a long-press with no page transition, so the artwork
              is what confirms *which* item you grabbed. */}
          <SheetHeader>
            <SheetPoster item={item} />
            <SheetHeader.Content>
              <SheetHeader.Title>{item.title}</SheetHeader.Title>
              <SheetHeader.Subtitle>
                {[item.type, item.year != null ? String(item.year) : null]
                  .filter((part) => part != null)
                  .join(' · ')}
              </SheetHeader.Subtitle>
              {item.type !== 'MANGA' && <AnimatedText
                key={`${item.id}-${runtimeLabel}`}
                className="min-h-5 text-muted font-sans text-sm mt-1"
                style={{
                  animationName: runtimeFade,
                  animationDuration: reducedMotion ? 0 : DURATION.swap,
                  animationTimingFunction: EASE_OUT,
                }}
              >{runtimeLabel}</AnimatedText>}
            </SheetHeader.Content>
          </SheetHeader>

          {/* The credit that put this card in front of you (person/studio
              pages). The card clamps "2026 · Frank Castle" to one line, so the
              full character or job goes here — unclamped, with the face beside
              it, the same header shape the credit sheet uses. */}
          {credit != null && (
            <View className="flex-row items-center gap-3 mt-4">
              <PersonAvatar
                className="w-10 h-10 bg-surface"
                headshot={credit.headshot}
                name={credit.name}
                textClassName="text-xs"
              />
              <View className="flex-1">
                <Text className="text-foreground font-sans-semibold text-sm">
                  {credit.name}
                </Text>
                <Text className="text-muted font-sans text-sm">
                  {creditRoleLine(credit)}
                </Text>
              </View>
            </View>
          )}

          <View className="mt-5">
            {/* key: the button's sheet/result state must not leak between items. */}
            {/* Same placement predicate the details screen uses (plan 0031
                R11) — this sheet renders `LogMediaButton` wholesale. Only an
                undatable film hides it; an unreleased one keeps its disabled
                release countdown beside the CTA that actually applies, the
                anime shape. */}
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
            {/* Opens the target picker in place of this sheet's rows (plan
                0032 U3). The picker stays mounted through the write — a toast
                can't carry a link, so a Trakt 420, an expired session or a
                manual row lands there; only a clean report closes the sheet. */}
            {watchlistVerb === 'add' && (
              <WatchlistMediaButton
                item={item}
                key={`watchlist-${item.id}`}
                onOpenPicker={() => setMode('watchlist-add')}
              />
            )}
            {/* The removal, wherever the gather can evidence who holds the item
                (R35 — see the prop's docblock). Its picker stays mounted
                through the write for the same reason the add's does — and one
                more: the row it removes leaves the grid when the invalidation
                lands, so the picker is the only place its partial-failure
                report, its AniList refusal or its unknown-membership rows can
                still be read. */}
            {watchlistVerb === 'remove' && removal != null && (
              <UnwatchlistMediaButton
                entry={removal.entry}
                errors={removal.errors}
                incomplete={removal.incomplete}
                key={`unwatchlist-${item.id}`}
                onOpenPicker={() => setMode('watchlist-remove')}
              />
            )}
            {item.type === 'TV' && seriesNext.status === 'unavailable' && (
              <Text className="text-muted font-sans text-sm mb-6">
                Episodes are logged per season from the details page.
              </Text>
            )}
          </View>

          <Button
            align="start"
            icon={<Button.Icon name="open-outline" />}
            label="View details"
            onPress={() => {
              onClose();
              pushRoute(routes.details(item.id, item.type));
            }}
            variant="quiet"
          />
          {links.map((link) => (
            <ProviderLinkRow
              className="mt-2"
              key={link.provider}
              link={link}
              onOpened={onClose}
            />
          ))}
          {canHide && (
            <Button
              align="start"
              className="mt-2"
              icon={<Button.Icon name="eye-off-outline" />}
              label={hideLabel}
              onPress={() => {
                haptics.confirm();
                hideItem({ id: item.id, title: item.title });
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
