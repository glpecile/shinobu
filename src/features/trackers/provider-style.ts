import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import type { MediaType } from '@/types/media';

/**
 * Per-provider brand tints, spelled out per class rather than composed as
 * `bg-provider-${id}`. Tailwind generates utilities by scanning source text, so
 * an interpolated class name produces no CSS at all — every variant that tints
 * by provider has to name its classes literally, here, once.
 *
 * Tokens live in `src/global.css` (plan 0026 KTD6, R10) — no hex in components.
 */
export const PROVIDER_DOT: Record<ProviderId, string> = {
  trakt: 'bg-provider-trakt',
  anilist: 'bg-provider-anilist',
  letterboxd: 'bg-provider-letterboxd',
  serializd: 'bg-provider-serializd',
};

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
 * nav rail *and* an always-visible action button beside it. The colored dot in
 * front of it already carries "connected", so the username alone says the rest
 * — the long form truncated to "Connecte…" in that column, which reads as a bug.
 */
export function compactStatus(
  connected: boolean,
  username: string | undefined,
): string {
  if (!connected) return 'Not connected';
  return username ?? 'Connected';
}
