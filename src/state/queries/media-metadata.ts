import { useQueries, useQueryClient } from '@tanstack/react-query';

import { applyPrimaryMetadata, mergeCatalogueMetadata } from '@/lib/providers/merge-metadata';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedMediaItem } from '@/types/media';
import { letterboxdFilmQuery } from './letterboxd';
import { mediaDetailsQuery } from './media-details';

/** Cache-only by default. Progress may retain its existing film-identity read. */
export function useMediaMetadata(items: readonly NormalizedMediaItem[], resolveLetterboxd = false) {
  const queryClient = useQueryClient();
  const hasTmdb = useTmdbToken() !== '';
  const needsIdentity = new Map<string, boolean>();
  for (const item of items) {
    const slug = item.externalIds.letterboxd;
    if (slug != null) needsIdentity.set(slug, needsIdentity.get(slug) === true || item.externalIds.tmdb == null);
  }
  const slugs = [...needsIdentity.keys()];
  const films = useQueries({ queries: slugs.map((slug) => ({
    ...letterboxdFilmQuery(slug, hasTmdb),
    enabled: resolveLetterboxd && needsIdentity.get(slug) === true,
  })) });
  const bySlug = new Map(slugs.map((slug, index) => [slug, films[index].data]));
  const identified = items.map((item) => {
    const film = bySlug.get(item.externalIds.letterboxd ?? '');
    return film != null ? mergeCatalogueMetadata(item, film) : item;
  });
  // Keep the real fetcher: a disabled observer must not replace an active
  // detail screen's query options with skipToken.
  const details = useQueries({ queries: identified.map((item) => ({
    ...mediaDetailsQuery(queryClient, item), enabled: false,
  })) });
  return {
    items: identified.map((item, index) => applyPrimaryMetadata(item, details[index].data?.catalogue)),
    queries: films,
  };
}
