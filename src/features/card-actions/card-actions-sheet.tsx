import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { Sheet } from '@/components/sheet';
import { LogMediaButton } from '@/features/log-media/log-media-button';
import { watchlistCtaIsPrimary } from '@/features/log-media/release-gate';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import { useSeriesNextEpisode } from '@/features/log-media/use-series-next-episode';
import { shouldOfferWatchlistAdd } from '@/features/watchlist-media/remove-targets';
import { UnwatchlistMediaButton } from '@/features/watchlist-media/unwatchlist-media-button';
import { WatchlistMediaButton } from '@/features/watchlist-media/watchlist-media-button';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { haptics } from '@/lib/haptics';
import { openExternalUrl } from '@/lib/open-external-url';
import { PROVIDERS } from '@/lib/providers/registry';
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
   * (plan 0031 U16/R35). Present on **`/watchlist` only** — the removal verb
   * needs a `WatchlistEntry` to route off its `sources`, and R35 places the
   * affordance on that surface and nowhere else: never details, never a search,
   * feed, person or studio card, where the app has no evidence of which
   * providers hold the item.
   *
   * Supplying it also switches the add row to R12's amended rule for this
   * surface (offered only while some applicable connected provider is still
   * missing the item), because "already on all of them" is a state only a
   * watchlist row can be in.
   */
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

/** The item's artwork, recovered lazily when the log it came from is artless. */
function SheetPoster({ item }: { item: NormalizedMediaItem }) {
  const { coverImage } = useTraktMediaImages(item);
  if (coverImage === '')
    return <PosterPlaceholder className="w-14 h-[84px] rounded" />;
  return (
    <Image
      source={{ uri: coverImage }}
      className="w-14 h-[84px] rounded bg-surface border border-border/50"
      contentFit="cover"
      recyclingKey={item.id}
    />
  );
}

/**
 * Per-item actions dialog for the feed, the diary and search: quick log, view
 * details, view on the relevant provider(s), hide. Opened by long-press on a
 * card or row everywhere, plus the hover ⋯ button on web (long-press is not a
 * discoverable web gesture). Quick log reuses
 * `LogMediaButton` wholesale — its confirm sheet (provider picker, backdate,
 * tags, partial-failure report) stacks above this one, and its outcome copy
 * lands here, so feed logging and details-page logging are one code path. The
 * want-to-watch CTA sits beside it under the same rules (plan 0031 U8) — on by
 * default, off on the diary.
 */
export function CardActionsSheet({
  item,
  open,
  onClose,
  hideLabel = 'Hide from feed',
  providerLinks = 'source',
  canHide = true,
  canWatchlist = true,
  watchlistRemoval = null,
}: CardActionsSheetProps) {
  const pushRoute = usePushRoute();
  const connected = useConnectedProviders();
  // Same read `LogMediaButton` uses (one cache entry, one request): a series
  // whose next episode Trakt can name gets the button, so the pointer to the
  // season picker below is only for the shows that don't.
  const seriesNext = useSeriesNextEpisode(item);
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  const links =
    item == null
      ? []
      : providerLinks === 'connected'
        ? providerLinksFor(item, connected)
        : [sourceLinkFor(item)].filter((link) => link != null);
  // R12 as amended (U16): on `/watchlist` the add row is offered only while some
  // applicable connected provider is still missing the item — a film on the
  // Letterboxd watchlist and not on Trakt's is exactly where an add is most
  // useful, and one already on every tracker it can reach has nothing to offer.
  // Everywhere else the row keeps its default-on behaviour.
  const showWatchlistAdd =
    canWatchlist &&
    (watchlistRemoval == null ||
      shouldOfferWatchlistAdd(
        watchlistRemoval.entry,
        connected,
        currentPlatform(),
        watchlistRemoval.errors,
        watchlistRemoval.incomplete,
      ));

  return (
    <Sheet onClose={onClose} open={open && item != null}>
      {item != null && (
        <>
          {/* Poster beside the title: the dialog is opened from a long-press
              with no page transition, so the artwork is what confirms *which*
              item you grabbed. */}
          <View className="flex-row items-center gap-4">
            <SheetPoster item={item} />
            <View className="flex-1">
              <Text
                className="text-2xl font-display text-foreground"
                numberOfLines={2}
              >
                {item.title}
              </Text>
              <Text className="text-muted font-sans text-sm mt-1">
                {[item.type, item.year != null ? String(item.year) : null]
                  .filter((part) => part != null)
                  .join(' · ')}
              </Text>
            </View>
          </View>

          <View className="mt-5">
            {/* key: the button's sheet/result state must not leak between items. */}
            {/* Same placement predicate the details screen uses (plan 0031
                R11) — this sheet renders `LogMediaButton` wholesale, so an
                unreleased film would otherwise show a permanently disabled
                "Not yet released" above the CTA that actually applies. */}
            {!watchlistCtaIsPrimary(item) && (
              <LogMediaButton item={item} key={item.id} />
            )}
            {/* Stays mounted through the write, unlike the hide row below: that
                is a synchronous local MMKV toggle with no per-provider outcome,
                this is a multi-provider network write. The app has no toast and
                the user is usually on search or the feed with no details screen
                behind this sheet, so closing on tap would surface a Trakt 420,
                an expired session or a manual row to nobody. Only a report with
                nothing left to read closes it. */}
            {showWatchlistAdd && (
              <WatchlistMediaButton
                item={item}
                key={`watchlist-${item.id}`}
                onCleanReport={onClose}
              />
            )}
            {/* The removal, on `/watchlist` only (R35). It stays mounted through
                the write for the same reason the add does — and one more: the
                row it removes leaves the grid when the invalidation lands, so
                this sheet is the only place its partial-failure report, its
                AniList refusal or its unknown-membership rows can still be
                read. */}
            {watchlistRemoval != null &&
              watchlistRemoval.entry.item.id === item.id && (
                <UnwatchlistMediaButton
                  entry={watchlistRemoval.entry}
                  errors={watchlistRemoval.errors}
                  incomplete={watchlistRemoval.incomplete}
                  key={`unwatchlist-${item.id}`}
                  onCleanReport={onClose}
                />
              )}
            {item.type === 'TV' && seriesNext.status === 'unavailable' && (
              <Text className="text-muted font-sans text-sm mb-6">
                Episodes are logged per season from the details page.
              </Text>
            )}
          </View>

          <PresstableOpacity
            className="flex-row items-center gap-3 rounded px-5 py-3 border border-border"
            onPress={() => {
              onClose();
              pushRoute(routes.details(item.id));
            }}
          >
            <Ionicons color={mutedColor} name="open-outline" size={18} />
            <Text className="text-foreground font-sans-semibold text-base">
              View details
            </Text>
          </PresstableOpacity>
          {links.map((link) => (
            <PresstableOpacity
              className="flex-row items-center gap-3 rounded px-5 py-3 mt-2 border border-border"
              key={link.provider}
              onPress={() => {
                haptics.selection();
                void openExternalUrl(link.url);
                // A new tab steals focus on web — closing the sheet here would
                // animate it shut in a now-backgrounded tab, which reads as
                // broken when the user switches back. Native's in-app browser
                // has no such background reflow, so it closes right after
                // opening, like every other action row.
                if (process.env.EXPO_OS !== 'web') onClose();
              }}
            >
              <ProviderIcon id={link.provider} size={18} />
              <Text className="text-foreground font-sans-semibold text-base flex-1">
                View on {PROVIDERS[link.provider].label}
              </Text>
              <Ionicons color={mutedColor} name="open-outline" size={16} />
            </PresstableOpacity>
          ))}
          {canHide && (
            <PresstableOpacity
              className="flex-row items-center gap-3 rounded px-5 py-3 mt-2 border border-border"
              onPress={() => {
                haptics.confirm();
                hideItem({ id: item.id, title: item.title });
                onClose();
              }}
            >
              <Ionicons color={mutedColor} name="eye-off-outline" size={18} />
              <Text className="text-foreground font-sans-semibold text-base">
                {hideLabel}
              </Text>
            </PresstableOpacity>
          )}
        </>
      )}
    </Sheet>
  );
}
