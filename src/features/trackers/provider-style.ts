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

export const PROVIDER_STRIPE: Record<ProviderId, string> = PROVIDER_DOT;

/** Icon chip: a 10% wash of the brand color behind a 30% brand hairline. */
export const PROVIDER_CHIP: Record<ProviderId, string> = {
  trakt: 'bg-provider-trakt/10 border-provider-trakt/30',
  anilist: 'bg-provider-anilist/10 border-provider-anilist/30',
  letterboxd: 'bg-provider-letterboxd/10 border-provider-letterboxd/30',
  serializd: 'bg-provider-serializd/10 border-provider-serializd/30',
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
