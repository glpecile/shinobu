import { useSimklWatchedInfo } from './simkl';
import { useTraktWatchedInfo, type TraktWatchedInfo } from './trakt';
import type { NormalizedMediaItem } from '@/types/media';

export type WatchedInfo = TraktWatchedInfo;

/**
 * Whether **any** connected provider records this item as watched, and when.
 * The single predicate behind both the details screen's "Watched · date" line
 * and `LogMediaButton`'s rewatch copy — asking one provider was the bug: a
 * movie logged to Simkl (the tracker that "just works") and not Trakt went on
 * offering "Mark as watched" on both web and mobile, while Simkl's own page
 * showed "Add Rewatch" (owner report 2026-08-01).
 *
 * Trakt first, then Simkl, so a Trakt-connected user keeps the richer read
 * (Trakt counts plays; Simkl records only the latest one). AniList isn't a leg
 * here — its list entry carries a *status*, not a play count, and its callers
 * read `useAniListEntryStateQuery` directly for that reason.
 */
export function useWatchedInfo(item: NormalizedMediaItem): WatchedInfo | null {
  const trakt = useTraktWatchedInfo(item);
  const simkl = useSimklWatchedInfo(item);
  return trakt ?? simkl;
}
