import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import type { MediaType } from '@/types/media';

const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  MOVIE: 'Movies',
  TV: 'TV',
  ANIME: 'Anime',
  MANGA: 'Manga',
};

/**
 * What this provider tracks, read off its registry capabilities rather than
 * hardcoded per card — a provider that gains or loses a media type relabels
 * itself (AGENTS.md: widen `PROVIDERS`, nothing else).
 */
export function capabilityLabels(id: ProviderId): string[] {
  return PROVIDERS[id].mediaTypes.map((type) => MEDIA_TYPE_LABEL[type]);
}

/**
 * A provider's connection state in one line, for surfaces with room for it
 * (the sheet). `username` is absent while the read that resolves it is in
 * flight, or if it failed — the line degrades to "Connected", never to a gap.
 */
export function statusLine(
  connected: boolean,
  username: string | undefined,
): string {
  if (!connected) return 'Not connected';
  return username != null ? `Connected as ${username}` : 'Connected';
}

/**
 * The same status, short enough to survive a 390px viewport minus the 64px web
 * nav rail *and* an always-visible action button beside it. That button
 * (Disconnect vs Connect) already carries "connected", so the username alone
 * says the rest — the long form truncated to "Connecte…" in that column, which
 * reads as a bug.
 */
export function compactStatus(
  connected: boolean,
  username: string | undefined,
): string {
  if (!connected) return 'Not connected';
  return username ?? 'Connected';
}
