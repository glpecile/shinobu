import type {
  NormalizedCastMember,
  NormalizedCompany,
  NormalizedCrewMember,
  NormalizedMediaItem,
  NormalizedPerson,
  NormalizedStudio,
  PersonCreditRow,
} from '@/types/media';
import { tmdbImageUrl } from './config';

/** Raw shapes for the slices of TMDB responses we read. */
interface TmdbCreditBase {
  id: number;
  media_type?: string;
  /** Movies title under `title`, TV under `name`. */
  title?: string | null;
  name?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  vote_average?: number | null;
}

export interface TmdbCastCredit extends TmdbCreditBase {
  character?: string | null;
}

export interface TmdbCrewCredit extends TmdbCreditBase {
  department?: string | null;
  job?: string | null;
}

export interface TmdbPersonResponse {
  id: number;
  name: string;
  biography?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  known_for_department?: string | null;
  profile_path?: string | null;
  combined_credits?: {
    cast?: TmdbCastCredit[];
    crew?: TmdbCrewCredit[];
  } | null;
}

export interface TmdbPersonSearchResponse {
  results?: Array<{
    id: number;
    name?: string | null;
    profile_path?: string | null;
    popularity?: number | null;
  }>;
}

/** A `/search/person` hit, just enough to pick a match and route to it. */
export interface PersonMatch {
  tmdbId: number;
  name: string;
}

const ACTING_ROLE = 'Acting';

function normalizePerson(raw: TmdbPersonResponse): NormalizedPerson {
  return {
    tmdbId: raw.id,
    name: raw.name,
    headshot: tmdbImageUrl(raw.profile_path, 'w342'),
    headshotFull: tmdbImageUrl(raw.profile_path, 'original'),
    ...(raw.biography != null && raw.biography !== ''
      ? { biography: raw.biography }
      : {}),
    ...(raw.birthday != null && raw.birthday !== ''
      ? { birthday: raw.birthday }
      : {}),
    ...(raw.deathday != null && raw.deathday !== ''
      ? { deathday: raw.deathday }
      : {}),
    ...(raw.place_of_birth != null && raw.place_of_birth !== ''
      ? { birthplace: raw.place_of_birth }
      : {}),
    ...(raw.known_for_department != null && raw.known_for_department !== ''
      ? { knownForDepartment: raw.known_for_department }
      : {}),
  };
}

export type TmdbKind = 'movie' | 'tv';

/**
 * The shared TMDB item → NormalizedMediaItem mapping. TMDB classifies anime
 * as plain `tv`, so everything here is MOVIE or TV — which is exactly what
 * the details screen needs to backfill a Trakt identity from
 * `externalIds.tmdb`. Untitled entries drop out.
 */
function normalizeKindedItem(
  raw: TmdbCreditBase,
  kind: TmdbKind,
  nowIso: string,
): NormalizedMediaItem | null {
  const title = (kind === 'movie' ? raw.title : raw.name) ?? '';
  if (title === '') return null;

  const date = kindedDate(raw, kind);
  const year = date != null ? Number(date.slice(0, 4)) : Number.NaN;
  const rating = raw.vote_average ?? 0;
  return {
    id: `tmdb-${kind}-${raw.id}`,
    title,
    coverImage: tmdbImageUrl(raw.poster_path, 'w342'),
    backdropImage: tmdbImageUrl(raw.backdrop_path, 'w780'),
    ...(raw.overview != null && raw.overview !== ''
      ? { overview: raw.overview }
      : {}),
    ...(Number.isFinite(year) && year > 0 ? { year } : {}),
    // TMDB reports 0 for unrated titles, not null — treat it as "no rating".
    ...(rating > 0 ? { rating } : {}),
    type: kind === 'movie' ? 'MOVIE' : 'TV',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: nowIso,
    externalIds: { tmdb: raw.id },
  };
}

/** Combined-credits entries carry their kind in `media_type`; others drop out. */
function normalizeCredit(
  raw: TmdbCreditBase,
  nowIso: string,
): NormalizedMediaItem | null {
  const kind =
    raw.media_type === 'movie' ? 'movie' : raw.media_type === 'tv' ? 'tv' : null;
  if (kind == null) return null;
  return normalizeKindedItem(raw, kind, nowIso);
}

function kindedDate(raw: TmdbCreditBase, kind: TmdbKind): string | null {
  const date = kind === 'movie' ? raw.release_date : raw.first_air_date;
  return date != null && date !== '' ? date : null;
}

function creditDate(raw: TmdbCreditBase): string | null {
  return kindedDate(raw, raw.media_type === 'movie' ? 'movie' : 'tv');
}

interface RowAccumulator {
  role: string;
  /** Keyed by normalized item id — a show reappears once per character/job. */
  entries: Map<
    string,
    { item: NormalizedMediaItem; date: string | null; details: string[] }
  >;
}

function accumulate(
  rows: Map<string, RowAccumulator>,
  role: string,
  raw: TmdbCreditBase,
  detail: string,
  nowIso: string,
): void {
  const item = normalizeCredit(raw, nowIso);
  if (item == null) return;
  let row = rows.get(role);
  if (row == null) {
    row = { role, entries: new Map() };
    rows.set(role, row);
  }
  const existing = row.entries.get(item.id);
  if (existing == null) {
    row.entries.set(item.id, {
      item,
      date: creditDate(raw),
      details: detail !== '' ? [detail] : [],
    });
  } else if (detail !== '' && !existing.details.includes(detail)) {
    // The same show once per character (or job) — merge into one credit.
    existing.details.push(detail);
  }
}

/**
 * Credits → one row per role: the `cast` side becomes "Acting", crew entries
 * group by their TMDB `department`. Within a row: newest first, with undated
 * (unreleased/unscheduled) work leading. Row order: the person's
 * known-for department first, then by row size.
 */
export function normalizeCreditRows(
  raw: TmdbPersonResponse,
  nowIso: string,
): PersonCreditRow[] {
  const rows = new Map<string, RowAccumulator>();
  for (const credit of raw.combined_credits?.cast ?? []) {
    accumulate(rows, ACTING_ROLE, credit, credit.character ?? '', nowIso);
  }
  for (const credit of raw.combined_credits?.crew ?? []) {
    const department = credit.department ?? '';
    if (department === '') continue;
    accumulate(rows, department, credit, credit.job ?? '', nowIso);
  }

  const ordered = [...rows.values()]
    .map((row) => {
      const sorted = [...row.entries.values()].sort((a, b) => {
        if (a.date == null && b.date == null) return 0;
        if (a.date == null) return -1;
        if (b.date == null) return 1;
        return b.date.localeCompare(a.date);
      });
      return {
        role: row.role,
        items: sorted.map((entry) => entry.item),
        details: Object.fromEntries(
          sorted
            .filter((entry) => entry.details.length > 0)
            .map((entry) => [entry.item.id, entry.details.join(', ')]),
        ),
      };
    })
    .sort((a, b) => b.items.length - a.items.length);

  const knownFor = raw.known_for_department;
  if (knownFor != null) {
    const leadIndex = ordered.findIndex((row) => row.role === knownFor);
    if (leadIndex > 0) {
      const [lead] = ordered.splice(leadIndex, 1);
      ordered.unshift(lead);
    }
  }
  return ordered;
}

export interface NormalizedPersonDetails {
  person: NormalizedPerson;
  rows: PersonCreditRow[];
}

export function normalizePersonDetails(
  raw: TmdbPersonResponse,
  nowIso: string,
): NormalizedPersonDetails {
  return {
    person: normalizePerson(raw),
    rows: normalizeCreditRows(raw, nowIso),
  };
}

export function normalizePersonSearch(
  raw: TmdbPersonSearchResponse,
): PersonMatch[] {
  return (raw.results ?? [])
    .map((entry) => ({ tmdbId: entry.id, name: entry.name ?? '' }))
    .filter((entry) => entry.name !== '');
}

/**
 * Lowercased, diacritic-stripped, whitespace-collapsed — so "Pom
 * Klementieff" matches "pom klementieff" and "José" matches "Jose".
 */
function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Word-order-insensitive fold: "Kaji Yuki" and "Yuki Kaji" collide. */
function foldNameSorted(name: string): string {
  return foldName(name).split(' ').sort().join(' ');
}

/**
 * Which search hit counts as *the* person — never blindly the top hit
 * (docs/solutions/trakt-text-search-wrong-movie-match.md, same class of
 * problem for people). Exact folded-name matches win first, then word-order
 * swaps (AniList romanizes Japanese names family-name-first while TMDB is
 * given-name-first), then TMDB's own relevance order as the fuzzy fallback —
 * the caller opted into name search knowing it's fuzzy.
 */
export function pickPersonMatch<T extends { name: string }>(
  results: T[],
  query: string,
): T | null {
  if (results.length === 0) return null;
  const wanted = foldName(query);
  const exact = results.find((result) => foldName(result.name) === wanted);
  if (exact != null) return exact;
  const wantedSorted = foldNameSorted(query);
  const reordered = results.find(
    (result) => foldNameSorted(result.name) === wantedSorted,
  );
  return reordered ?? results[0];
}

// ---- Media catalogue (TMDB-first detail screens, plan 0014) ----

interface TmdbGenre {
  id: number;
  name?: string | null;
}

interface TmdbCompanyRef {
  id: number;
  name?: string | null;
}

interface TmdbPersonRef {
  id: number;
  name?: string | null;
  profile_path?: string | null;
  order?: number | null;
}

export interface TmdbMovieCastEntry extends TmdbPersonRef {
  character?: string | null;
}

export interface TmdbMovieCrewEntry extends TmdbPersonRef {
  department?: string | null;
  job?: string | null;
}

/** `aggregate_credits` wraps per-season roles/jobs in arrays. */
export interface TmdbAggregateCastEntry extends TmdbPersonRef {
  roles?: Array<{ character?: string | null }>;
}

export interface TmdbAggregateCrewEntry extends TmdbPersonRef {
  department?: string | null;
  jobs?: Array<{ job?: string | null }>;
}

export interface TmdbMovieResponse extends TmdbCreditBase {
  genres?: TmdbGenre[];
  runtime?: number | null;
  production_companies?: TmdbCompanyRef[];
  credits?: {
    cast?: TmdbMovieCastEntry[];
    crew?: TmdbMovieCrewEntry[];
  } | null;
}

export interface TmdbTvResponse extends TmdbCreditBase {
  genres?: TmdbGenre[];
  episode_run_time?: number[];
  number_of_episodes?: number | null;
  production_companies?: TmdbCompanyRef[];
  aggregate_credits?: {
    cast?: TmdbAggregateCastEntry[];
    crew?: TmdbAggregateCrewEntry[];
  } | null;
}

/** What one `/movie/{id}` or `/tv/{id}` call yields for a detail screen. */
export interface TmdbMediaCatalogue {
  catalogue: NormalizedMediaItem;
  cast: NormalizedCastMember[];
  crew: NormalizedCrewMember[];
  studios: NormalizedStudio[];
}

const CAST_LIMIT = 15;
const CREW_LIMIT = 20;

/** TMDB capitalizes departments; higher-billing ones surface first. */
const TMDB_CREW_DEPARTMENT_ORDER = [
  'Directing',
  'Writing',
  'Production',
  'Editing',
  'Camera',
  'Sound',
  'Art',
  'Costume & Make-Up',
  'Visual Effects',
];

function tmdbPersonId(id: number): string {
  return `tmdb-person-${id}`;
}

function normalizeCastEntries(
  entries: Array<TmdbPersonRef & { characters: string[] }>,
): NormalizedCastMember[] {
  return entries
    .filter((entry) => entry.name != null && entry.name !== '')
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
    .slice(0, CAST_LIMIT)
    .map((entry) => ({
      id: tmdbPersonId(entry.id),
      name: entry.name ?? '',
      character: entry.characters.filter((c) => c !== '').join(', '),
      headshot: tmdbImageUrl(entry.profile_path, 'w185'),
      tmdbId: entry.id,
    }));
}

/**
 * Flattens crew into one billing-ordered list, one entry per person — someone
 * credited in several departments gets their jobs merged instead of appearing
 * twice (same contract as the Trakt normalizer's `normalizeCrew`).
 */
function normalizeCrewEntries(
  entries: Array<TmdbPersonRef & { department: string; jobs: string[] }>,
): NormalizedCrewMember[] {
  const departmentRank = (department: string): number => {
    const index = TMDB_CREW_DEPARTMENT_ORDER.indexOf(department);
    return index === -1 ? TMDB_CREW_DEPARTMENT_ORDER.length : index;
  };
  const byPerson = new Map<string, { member: NormalizedCrewMember; jobs: string[]; rank: number }>();

  for (const entry of entries) {
    if (entry.name == null || entry.name === '') continue;
    const id = tmdbPersonId(entry.id);
    const existing = byPerson.get(id);
    const jobs = entry.jobs.filter((job) => job !== '');
    if (existing != null) {
      for (const job of jobs) {
        if (!existing.jobs.includes(job)) existing.jobs.push(job);
      }
      existing.rank = Math.min(existing.rank, departmentRank(entry.department));
    } else {
      byPerson.set(id, {
        member: {
          id,
          name: entry.name,
          job: '',
          headshot: tmdbImageUrl(entry.profile_path, 'w185'),
          tmdbId: entry.id,
        },
        jobs: [...jobs],
        rank: departmentRank(entry.department),
      });
    }
  }

  return [...byPerson.values()]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, CREW_LIMIT)
    .map((entry) => ({ ...entry.member, job: entry.jobs.join(', ') }));
}

function normalizeCompanies(
  companies: TmdbCompanyRef[] | undefined,
): NormalizedStudio[] {
  return (companies ?? [])
    .filter((company) => company.name != null && company.name !== '')
    .map((company) => ({
      id: `tmdb-studio-${company.id}`,
      name: company.name ?? '',
      tmdbId: company.id,
    }));
}

/** Catalogue-only fields shared by movie and tv detail responses. */
function catalogueExtras(
  raw: TmdbMovieResponse | TmdbTvResponse,
  runtime: number | undefined,
  totalEpisodes: number | undefined,
): Partial<NormalizedMediaItem> {
  const genres = (raw.genres ?? [])
    .map((genre) => genre.name ?? '')
    .filter((name) => name !== '');
  return {
    // Detail hero wants the sharper backdrop; the base normalizer's w780
    // suits cards, not a full-bleed header.
    backdropImage: tmdbImageUrl(raw.backdrop_path, 'w1280'),
    ...(genres.length > 0 ? { genres } : {}),
    ...(runtime != null && runtime > 0 ? { runtime } : {}),
    ...(totalEpisodes != null && totalEpisodes > 0 ? { totalEpisodes } : {}),
  };
}

export function normalizeMovieCatalogue(
  raw: TmdbMovieResponse,
  nowIso: string,
): TmdbMediaCatalogue | null {
  const item = normalizeKindedItem(raw, 'movie', nowIso);
  if (item == null) return null;
  return {
    catalogue: {
      ...item,
      ...catalogueExtras(raw, raw.runtime ?? undefined, undefined),
    },
    cast: normalizeCastEntries(
      (raw.credits?.cast ?? []).map((entry) => ({
        ...entry,
        characters: [entry.character ?? ''],
      })),
    ),
    crew: normalizeCrewEntries(
      (raw.credits?.crew ?? []).map((entry) => ({
        ...entry,
        department: entry.department ?? '',
        jobs: [entry.job ?? ''],
      })),
    ),
    studios: normalizeCompanies(raw.production_companies),
  };
}

export function normalizeTvCatalogue(
  raw: TmdbTvResponse,
  nowIso: string,
): TmdbMediaCatalogue | null {
  const item = normalizeKindedItem(raw, 'tv', nowIso);
  if (item == null) return null;
  return {
    catalogue: {
      ...item,
      ...catalogueExtras(
        raw,
        raw.episode_run_time?.[0],
        raw.number_of_episodes ?? undefined,
      ),
    },
    cast: normalizeCastEntries(
      (raw.aggregate_credits?.cast ?? []).map((entry) => ({
        ...entry,
        characters: (entry.roles ?? []).map((role) => role.character ?? ''),
      })),
    ),
    crew: normalizeCrewEntries(
      (raw.aggregate_credits?.crew ?? []).map((entry) => ({
        ...entry,
        department: entry.department ?? '',
        jobs: (entry.jobs ?? []).map((job) => job.job ?? ''),
      })),
    ),
    studios: normalizeCompanies(raw.production_companies),
  };
}

// ---- Studio pages ----

export interface TmdbCompanyResponse {
  id: number;
  name?: string | null;
  logo_path?: string | null;
  headquarters?: string | null;
  homepage?: string | null;
}

export interface TmdbDiscoverResponse {
  results?: TmdbCreditBase[];
}

export interface StudioRow {
  title: string;
  items: NormalizedMediaItem[];
}

export interface NormalizedStudioDetails {
  company: NormalizedCompany;
  rows: StudioRow[];
}

export function normalizeStudioDetails(
  raw: {
    company: TmdbCompanyResponse;
    movies: TmdbDiscoverResponse;
    tv: TmdbDiscoverResponse;
  },
  nowIso: string,
): NormalizedStudioDetails {
  const rows: StudioRow[] = [
    {
      title: 'Movies',
      items: (raw.movies.results ?? [])
        .map((entry) => normalizeKindedItem(entry, 'movie', nowIso))
        .filter((item) => item != null),
    },
    {
      title: 'TV Shows',
      items: (raw.tv.results ?? [])
        .map((entry) => normalizeKindedItem(entry, 'tv', nowIso))
        .filter((item) => item != null),
    },
  ].filter((row) => row.items.length > 0);

  return {
    company: {
      tmdbId: raw.company.id,
      name: raw.company.name ?? '',
      logo: tmdbImageUrl(raw.company.logo_path, 'w300'),
      ...(raw.company.headquarters != null && raw.company.headquarters !== ''
        ? { headquarters: raw.company.headquarters }
        : {}),
      ...(raw.company.homepage != null && raw.company.homepage !== ''
        ? { homepage: raw.company.homepage }
        : {}),
    },
    rows,
  };
}

export interface TmdbCompanySearchResponse {
  results?: Array<{ id: number; name?: string | null }>;
}

export function normalizeCompanySearch(
  raw: TmdbCompanySearchResponse,
): PersonMatch[] {
  return (raw.results ?? [])
    .map((entry) => ({ tmdbId: entry.id, name: entry.name ?? '' }))
    .filter((entry) => entry.name !== '');
}

// ---- Title search (title+year → TMDB id, for id-less items) ----

/** `/search/movie` (or `/tv`) result rows — the same slice as a credit row. */
export interface TmdbSearchResponse {
  results?: TmdbCreditBase[];
}

/**
 * `/search/{kind}` rows → normalized items, so a title+year lookup can pick
 * the match (`pickMovieMatch`) and read its `externalIds.tmdb`. Reuses the
 * shared item mapping — untitled hits drop out.
 */
export function normalizeTitleSearch(
  raw: TmdbSearchResponse,
  kind: TmdbKind,
  nowIso: string,
): NormalizedMediaItem[] {
  return (raw.results ?? [])
    .map((entry) => normalizeKindedItem(entry, kind, nowIso))
    .filter((item) => item != null);
}

// ---- /find external-id bridge ----

export interface TmdbFindResponse {
  tv_results?: Array<{ id: number }>;
}
