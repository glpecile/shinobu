import {
  errorOutcomeLinks,
  splitSkippedOutcomes,
  type ErrorOutcomeLink,
  type SkippedOutcomesSplit,
} from '@/features/log-media/manual-write-links';
import type { UrlItem } from '@/lib/providers/external-urls';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import { Provider, type ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

export function isReadIntent(item: Pick<NormalizedMediaItem, 'type'>): boolean {
  return item.type === 'MANGA' || item.type === 'BOOK';
}

export interface WatchlistCtaCopy {
  idle: string;
  settled: string;
  pending: string;
}

export function watchlistCtaCopy(item: Pick<NormalizedMediaItem, 'type'>): WatchlistCtaCopy {
  return isReadIntent(item)
    ? {
        idle: 'Add to reading list',
        settled: 'On your reading list',
        pending: 'Adding…',
      }
    : {
        idle: 'Add to watchlist',
        settled: 'On your watchlist',
        pending: 'Adding…',
      };
}

export function unwatchlistCtaCopy(item: Pick<NormalizedMediaItem, 'type'>): WatchlistCtaCopy {
  return isReadIntent(item)
    ? {
        idle: 'Remove from reading list',
        settled: 'Removed',
        pending: 'Removing…',
      }
    : {
        idle: 'Remove from watchlist',
        settled: 'Removed',
        pending: 'Removing…',
      };
}

export function watchlistConfirmLabel(
  item: Pick<NormalizedMediaItem, 'type'>,
  count: number,
): string {
  const noun = isReadIntent(item) ? 'reading list' : 'watchlist';
  return count > 1 ? `Add to ${count} ${noun}s` : `Add to ${noun}`;
}

export function unwatchlistConfirmLabel(
  item: Pick<NormalizedMediaItem, 'type'>,
  count: number,
): string {
  const noun = isReadIntent(item) ? 'reading list' : 'watchlist';
  return count > 1 ? `Remove from ${count} ${noun}s` : `Remove from ${noun}`;
}

export function removalLine(
  provider: ProviderId,
  entry: {
    item: Pick<NormalizedMediaItem, 'bridgedAniList'>;
    anilistStatus?: 'CURRENT' | 'PLANNING';
    simklWatchedCount?: number;
  },
): { text: string; destructive: boolean } {
  switch (provider) {
    case Provider.AniList:
      return entry.anilistStatus === 'CURRENT'
        ? {
            text: 'Can’t un-plan something you’re watching, so this deletes the whole entry — progress, score, notes and dates included.',
            destructive: true,
          }
        : {
            text:
              entry.item.bridgedAniList != null
                ? `Deletes the Planning entry “${entry.item.bridgedAniList.title}”.`
                : 'Deletes the Planning entry.',
            destructive: false,
          };
    case Provider.Simkl:
      return (entry.simklWatchedCount ?? 0) > 0
        ? {
            text: 'Can’t drop just the plan-to-watch status, so this deletes the whole entry — watch history and rating included, and the show leaves Continue Watching and This week.',
            destructive: true,
          }
        : { text: 'Leaves Plan to Watch.', destructive: false };
    case Provider.Hardcover:
      return { text: 'Leaves Want to Read.', destructive: false };
    case Provider.Trakt:
    case Provider.Letterboxd:
    case Provider.Serializd:
      return { text: 'Leaves your watchlist.', destructive: false };
  }
}

export function destructiveProviders(
  selected: readonly ProviderId[],
  entry: Parameters<typeof removalLine>[1],
): ProviderId[] {
  return selected.filter((provider) => removalLine(provider, entry).destructive);
}

export const DESTRUCTIVE_REMOVE_CONFIRM_LABEL = 'Remove anyway';

export function addedToastTitle(item: Pick<NormalizedMediaItem, 'type'>): string {
  return isReadIntent(item) ? 'Added to reading list' : 'Added to watchlist';
}

export function removedToastTitle(item: Pick<NormalizedMediaItem, 'type'>): string {
  return isReadIntent(item) ? 'Removed from reading list' : 'Removed from watchlist';
}

export function providerLabelList(ids: readonly ProviderId[]): string {
  return ids.map((id) => PROVIDERS[id].label).join(', ');
}

export interface WatchlistReportLike {
  succeeded: readonly ProviderId[];
  failed: readonly ProviderId[];
  outcomes: readonly ProviderWriteOutcome[];
}

export interface WatchlistResultView {
  succeeded: readonly ProviderId[];
  failed: readonly ProviderId[];
  errorLinks: ErrorOutcomeLink[];
  reasonedSkips: SkippedOutcomesSplit['reasonedSkips'];
  allSkip: boolean;
}

export function watchlistResultView(
  result: WatchlistReportLike,
  item: UrlItem,
): WatchlistResultView {
  const { reasonedSkips } = splitSkippedOutcomes(result.outcomes);
  return {
    succeeded: result.succeeded,
    failed: result.failed,
    errorLinks: errorOutcomeLinks(result.outcomes, item),
    reasonedSkips,
    allSkip:
      result.failed.length === 0 && result.succeeded.length === 0 && reasonedSkips.length > 0,
  };
}

export function isWatchlistCtaSettled(
  onList: boolean | undefined,
  view: Pick<WatchlistResultView, 'failed'> | null,
  stillOffered = false,
): boolean {
  return onList === true && !stillOffered && (view?.failed.length ?? 0) === 0;
}

export function addedToSentence(succeeded: readonly ProviderId[]): string {
  return `Added to ${providerLabelList(succeeded)}.`;
}

export function removedFromSentence(succeeded: readonly ProviderId[]): string {
  return `Removed from ${providerLabelList(succeeded)}.`;
}

export function isUnwatchlistCtaSettled(
  onList: boolean | undefined,
  view: Pick<WatchlistResultView, 'failed'> | null,
  membershipUnknown: readonly ProviderId[],
): boolean {
  return (
    view != null && view.failed.length === 0 && membershipUnknown.length === 0 && onList === false
  );
}

export function failedOnSentence(failed: readonly ProviderId[]): string {
  return `Failed on ${providerLabelList(failed)}.`;
}
