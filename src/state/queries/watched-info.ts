import { useSimklWatchedInfo } from './simkl';
import { useTraktWatchedInfo, type TraktWatchedInfo } from './trakt';
import type { NormalizedMediaItem } from '@/types/media';

export type WatchedInfo = TraktWatchedInfo;

/** Checks Trakt before Simkl because Trakt counts plays while Simkl only records the latest watch. */
export function useWatchedInfo(item: NormalizedMediaItem): WatchedInfo | null {
  const trakt = useTraktWatchedInfo(item);
  const simkl = useSimklWatchedInfo(item);
  return trakt ?? simkl;
}
