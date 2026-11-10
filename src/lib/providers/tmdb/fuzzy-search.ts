import { searchFuzzy } from '@/lib/providers/fuzzy-search';
import type { TmdbDeps } from './deps';
import { searchTitles } from './reads';

export const searchTitlesFuzzy = (deps: TmdbDeps, params: { query: string }) =>
  searchFuzzy(params.query, (query) => searchTitles(deps, { query }));
