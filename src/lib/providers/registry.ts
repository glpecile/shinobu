import type { ProviderDescriptor, ProviderId } from './types';

/**
 * The single provider registry. Routing (routing.ts) derives everything from
 * these declarations — adding or degrading a provider happens here, never via
 * scattered `if (provider === ...)` checks.
 */
export const PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
  trakt: {
    id: 'trakt',
    label: 'Trakt',
    mediaTypes: ['TV', 'MOVIE'],
    canRead: true,
    canWrite: true,
  },
  anilist: {
    id: 'anilist',
    label: 'AniList',
    mediaTypes: ['ANIME', 'MANGA'],
    canRead: true,
    canWrite: true,
  },
  // API access is request-only and excludes "personal projects" (todos/004).
  // If access is denied, flip canRead/canWrite to false here — the CSV
  // export/import fallback lives outside this registry, not as a fake write.
  letterboxd: {
    id: 'letterboxd',
    label: 'Letterboxd',
    mediaTypes: ['MOVIE'],
    canRead: true,
    canWrite: true,
  },
};
