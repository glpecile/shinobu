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
  const films = useQueries({
    queries: slugs.map((slug) => ({
      ...letterboxdFilmQuery(slug, hasTmdb),
      enabled: resolveLetterboxd && needsIdentity.get(slug) === true,
    })),
    // A summary, not each film's result: a read starting or finishing without
    // new identity re-renders nothing.
    combine: (results) => {
      const enabled = results.filter((result) => result.isEnabled);
      return {
        data: results.map((result) => result.data),
        loading: enabled.some((result) => result.isPending || result.isFetching),
        failed: enabled.some((result) => result.isError),
        refetches: enabled.map((result) => result.refetch),
      };
    },
  });
  const bySlug = new Map(slugs.map((slug, index) => [slug, films.data[index]]));
  const identified = items.map((item) => {
    const film = bySlug.get(item.externalIds.letterboxd ?? '');
    return film != null ? mergeCatalogueMetadata(item, film) : item;
  });
  // Keep the real fetcher: a disabled observer must not replace an active
  // detail screen's query options with skipToken.
  // Structurally shared, so an item keeps its object until its own metadata
  // changes and a list redraws only that cell.
  const resolved = useQueries({
    queries: identified.map((item) => ({ ...mediaDetailsQuery(queryClient, item), enabled: false })),
    combine: (results) => identified.map((item, index) => applyPrimaryMetadata(item, results[index].data?.catalogue)),
  });
  return {
    items: resolved,
    loading: films.loading,
    failed: films.failed,
    refetches: films.refetches,
  };
}
