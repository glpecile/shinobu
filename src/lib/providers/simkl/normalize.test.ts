import { describe, expect, test } from 'bun:test';

import {
  normalizeActivities,
  normalizeAllItems,
  normalizeCalendarFile,
  normalizeLibraryEntry,
  normalizeSearchIdMatch,
  normalizeTrendingItem,
  normalizeUserSettings,
  simklFanartUrl,
  simklPosterUrl,
  type SimklActivitiesRaw,
  type SimklAllItemsEntry,
  type SimklAllItemsResponse,
  type SimklCalendarFile,
  type SimklSearchIdMatch,
  type SimklTrendingItem,
  type SimklUserSettingsRaw,
} from './normalize';

const NOW = '2026-07-31T12:00:00.000Z';

describe('simkl image URLs', () => {
  test('poster fragments compose to the direct simkl.in medium webp', () => {
    // Convention: api.simkl.org/conventions/images (poster `_m` size); the
    // direct simkl.in host was live-probed 2026-07-31 (200 image/webp).
    expect(simklPosterUrl('20/20233461737b3bf5ec')).toBe(
      'https://simkl.in/posters/20/20233461737b3bf5ec_m.webp',
    );
    expect(simklPosterUrl(null)).toBe('');
    expect(simklPosterUrl(undefined)).toBe('');
  });

  test('fanart fragments compose to the mobile-size webp', () => {
    expect(simklFanartUrl('20/20397495e29a88fd8d')).toBe(
      'https://simkl.in/fanart/20/20397495e29a88fd8d_mobile.webp',
    );
    expect(simklFanartUrl(null)).toBe('');
  });
});

describe('normalizeLibraryEntry', () => {
  const showEntry: SimklAllItemsEntry = {
    status: 'watching',
    watched_episodes_count: 12,
    total_episodes_count: 26,
    added_to_watchlist_at: '2026-05-01T10:00:00Z',
    last_watched_at: '2026-07-20T21:30:00Z',
    last_watched: 'S01E12',
    next_to_watch: 'S01E13',
    next_to_watch_info: {
      title: 'The Red Keep',
      season: 1,
      episode: 13,
      date: '2026-08-03T01:00:00Z',
    },
    seasons: [
      {
        number: 1,
        episodes: [
          { number: 11, watched_at: '2026-07-19T20:00:00Z' },
          { number: 12, watched_at: '2026-07-20T21:30:00Z' },
        ],
      },
    ],
    show: {
      title: 'House of the Dragon',
      poster: '12/127230752d75bc8c3a',
      year: 2022,
      ids: {
        simkl: 1197910,
        slug: 'house-of-the-dragon',
        // Simkl sends tmdb/tvdb as strings on several surfaces — coerced.
        tmdb: '94997',
        tvdb: '371572',
        imdb: 'tt11198330',
      },
    },
  };

  test('a watching show becomes a TV item with coerced external ids', () => {
    const entry = normalizeLibraryEntry(showEntry, 'shows', NOW);
    expect(entry).not.toBeNull();
    expect(entry!.item).toMatchObject({
      id: 'simkl-1197910',
      title: 'House of the Dragon',
      coverImage: 'https://simkl.in/posters/12/127230752d75bc8c3a_m.webp',
      year: 2022,
      type: 'TV',
      currentProgress: 12,
      totalEpisodes: 26,
      lastUpdated: '2026-07-20T21:30:00Z',
      externalIds: {
        simkl: 1197910,
        tmdb: 94997,
        tvdb: 371572,
        imdb: 'tt11198330',
      },
    });
    expect(entry!.item.isFilm).toBeUndefined();
    expect(entry!.status).toBe('watching');
  });

  test('per-episode watched timestamps become keys and instants', () => {
    const entry = normalizeLibraryEntry(showEntry, 'shows', NOW)!;
    expect(entry.watchedKeys.has('1-12')).toBe(true);
    expect(entry.watchedKeys.has('1-13')).toBe(false);
    expect(entry.watchedEpisodes).toContainEqual({
      season: 1,
      number: 12,
      watchedAt: '2026-07-20T21:30:00Z',
    });
  });

  test('next_to_watch_info carries the air instant verbatim', () => {
    const entry = normalizeLibraryEntry(showEntry, 'shows', NOW)!;
    expect(entry.nextToWatch).toEqual({
      season: 1,
      episode: 13,
      title: 'The Red Keep',
      date: '2026-08-03T01:00:00Z',
    });
  });

  test('not_aired_episodes_count survives as notAiredEpisodes (plan 0034 U8)', () => {
    // Up Next's null-date arithmetic (`watched < total - notAired`) is the
    // only consumer — dropping the count here would silently hide every
    // undated catch-up pointer.
    const entry = normalizeLibraryEntry(
      { ...showEntry, not_aired_episodes_count: 3 },
      'shows',
      NOW,
    )!;
    expect(entry.notAiredEpisodes).toBe(3);
    // Absent upstream stays absent — never a fabricated zero (unknown is not
    // "everything aired").
    expect(
      normalizeLibraryEntry(showEntry, 'shows', NOW)!.notAiredEpisodes,
    ).toBeUndefined();
  });

  test('falls back to parsing the S##E## pointer when info is absent', () => {
    const entry = normalizeLibraryEntry(
      { ...showEntry, next_to_watch_info: undefined },
      'shows',
      NOW,
    )!;
    expect(entry.nextToWatch).toEqual({ season: 1, episode: 13, date: null });
  });

  test('an anime film normalizes to ANIME with isFilm true', () => {
    const entry = normalizeLibraryEntry(
      {
        status: 'completed',
        watched_episodes_count: 1,
        last_watched_at: '2026-07-25T22:00:00Z',
        show: {
          title: 'Demon Slayer: Infinity Castle',
          poster: '24/24b1c1',
          year: 2025,
          anime_type: 'movie',
          ids: { simkl: 2498112, mal: '59192', anilist: '178788', tmdb: '1311031' },
        },
      },
      'anime',
      NOW,
    );
    expect(entry).not.toBeNull();
    expect(entry!.item.type).toBe('ANIME');
    expect(entry!.item.isFilm).toBe(true);
    expect(entry!.item.externalIds).toMatchObject({
      simkl: 2498112,
      mal: 59192,
      anilist: 178788,
      tmdb: 1311031,
    });
  });

  test('an anime series stays ANIME without isFilm', () => {
    const entry = normalizeLibraryEntry(
      {
        status: 'watching',
        watched_episodes_count: 3,
        show: {
          title: 'Slime',
          anime_type: 'tv',
          ids: { simkl: 2969868, mal: '59970' },
        },
      },
      'anime',
      NOW,
    );
    expect(entry!.item.type).toBe('ANIME');
    expect(entry!.item.isFilm).toBeUndefined();
  });

  test('a completed movie counts one play even without an episode count', () => {
    const entry = normalizeLibraryEntry(
      {
        status: 'completed',
        last_watched_at: '2026-06-01T20:00:00Z',
        movie: {
          title: 'Perfect Blue',
          poster: '99/99aa',
          year: 1997,
          ids: { simkl: 46020, tmdb: 10494 },
        },
      },
      'movies',
      NOW,
    );
    expect(entry!.item.type).toBe('MOVIE');
    expect(entry!.item.currentProgress).toBe(1);
    expect(entry!.item.lastUpdated).toBe('2026-06-01T20:00:00Z');
  });

  test('watchlist-only items fall back to added_to_watchlist_at, then now', () => {
    const entry = normalizeLibraryEntry(
      {
        status: 'plantowatch',
        added_to_watchlist_at: '2026-07-01T09:00:00Z',
        movie: { title: 'The Odyssey', ids: { simkl: 2604475 } },
      },
      'movies',
      NOW,
    );
    expect(entry!.item.lastUpdated).toBe('2026-07-01T09:00:00Z');
    expect(entry!.status).toBe('plantowatch');
    expect(entry!.addedToWatchlistAt).toBe('2026-07-01T09:00:00Z');

    const bare = normalizeLibraryEntry(
      {
        status: 'plantowatch',
        movie: { title: 'The Odyssey', ids: { simkl: 2604475 } },
      },
      'movies',
      NOW,
    );
    expect(bare!.item.lastUpdated).toBe(NOW);
  });

  test('entries without a resolvable simkl id or title drop', () => {
    expect(
      normalizeLibraryEntry(
        { status: 'watching', show: { title: 'Ghost', ids: {} } },
        'shows',
        NOW,
      ),
    ).toBeNull();
    expect(
      normalizeLibraryEntry(
        { status: 'watching', show: { ids: { simkl: 1 } } },
        'shows',
        NOW,
      ),
    ).toBeNull();
    expect(normalizeLibraryEntry({ status: 'watching' }, 'shows', NOW)).toBeNull();
  });

  test('junk numeric ids are dropped rather than becoming NaN', () => {
    // Live probe 2026-07-31: trending anime carried a corrupted `anidb` value;
    // the same defense applies to every numeric id field.
    const entry = normalizeLibraryEntry(
      {
        status: 'watching',
        show: {
          title: 'Slime',
          ids: { simkl: 2969868, tmdb: 'not-a-number' },
        },
      },
      'anime',
      NOW,
    );
    expect(entry!.item.externalIds.tmdb).toBeUndefined();
  });
});

describe('normalizeAllItems', () => {
  test('an empty library ({} response) yields empty buckets', () => {
    const library = normalizeAllItems({}, NOW);
    expect(library).toEqual({ shows: [], movies: [], anime: [] });
  });

  test('buckets are normalized independently and drops are silent', () => {
    const raw: SimklAllItemsResponse = {
      shows: [
        {
          status: 'watching',
          watched_episodes_count: 1,
          show: { title: 'A', ids: { simkl: 1 } },
        },
        { status: 'watching' }, // no media object — drops
      ],
      movies: [
        {
          status: 'completed',
          movie: { title: 'B', ids: { simkl: 2 } },
        },
      ],
    };
    const library = normalizeAllItems(raw, NOW);
    expect(library.shows).toHaveLength(1);
    expect(library.movies).toHaveLength(1);
    expect(library.anime).toHaveLength(0);
    expect(library.shows[0]!.item.id).toBe('simkl-1');
  });
});

describe('normalizeCalendarFile', () => {
  const file: SimklCalendarFile = {
    calendar: [
      {
        simkl_id: 3129753,
        date: '2026-07-30T04:00:00Z',
        finale_type: 3,
        episode: {
          season: 1,
          episode: 4,
          title: 'Mud Burn',
          url: 'https://simkl.com/tv/3129753/the-man-will-burn/season-1/episode-4/',
        },
      },
      {
        simkl_id: 3198551,
        date: '2026-08-02T16:00:00Z',
        finale_type: null,
        episode: { season: 1, episode: 2, title: 'Episode 2' },
      },
      // A movie_release-style entry: no episode object at all.
      { simkl_id: 2604475, date: '2026-07-15T00:00:00Z', finale_type: null },
    ],
    metadata: {
      '3129753': {
        title: 'The Man Will Burn',
        poster: '11/11aa22',
        ids: { simkl_id: 3129753, tmdb: '271016', tvdb: '467969', imdb: 'tt37118307' },
        total_episodes: 4,
      },
      '3198551': {
        title: 'Mystic Nine',
        poster: '20/203793914f7c3b2d61',
        ids: { simkl_id: 3198551 },
        anime_type: 'tv',
      },
    },
  };

  test('keeps the Z instants byte-for-byte (the has-aired contract)', () => {
    const entries = normalizeCalendarFile(file);
    expect(entries.map((entry) => entry.date)).toEqual([
      '2026-07-30T04:00:00Z',
      '2026-08-02T16:00:00Z',
      '2026-07-15T00:00:00Z',
    ]);
  });

  test('joins metadata by simkl id: title, poster, ids, finale flag', () => {
    const [finale] = normalizeCalendarFile(file);
    expect(finale).toMatchObject({
      simklId: 3129753,
      title: 'The Man Will Burn',
      poster: 'https://simkl.in/posters/11/11aa22_m.webp',
      finaleType: 'series',
      episode: { season: 1, number: 4, title: 'Mud Burn' },
      totalEpisodes: 4,
      externalIds: {
        simkl: 3129753,
        tmdb: 271016,
        tvdb: 467969,
        imdb: 'tt37118307',
      },
    });
  });

  test('a regular airing has no finale flag; movie entries have no episode', () => {
    const entries = normalizeCalendarFile(file);
    expect(entries[1]!.finaleType).toBeUndefined();
    expect(entries[2]!.episode).toBeUndefined();
  });

  test('an entry without metadata still carries its simkl id', () => {
    const entries = normalizeCalendarFile(file);
    const orphan = entries[2]!;
    expect(orphan.simklId).toBe(2604475);
    expect(orphan.title).toBe('');
    expect(orphan.poster).toBe('');
    expect(orphan.externalIds).toEqual({ simkl: 2604475 });
  });

  test('entries without an id or an instant drop', () => {
    const entries = normalizeCalendarFile({
      calendar: [
        { simkl_id: 1 },
        { date: '2026-07-30T04:00:00Z' },
        { simkl_id: 2, date: '2026-07-30T04:00:00Z' },
      ],
      metadata: {},
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.simklId).toBe(2);
  });
});

describe('normalizeTrendingItem', () => {
  const movie: SimklTrendingItem = {
    title: 'The Odyssey',
    poster: '20/20233461737b3bf5ec',
    fanart: '20/20397495e29a88fd8d',
    overview: 'Odysseus sails home.',
    release_date: '07/15/2026',
    genres: ['Adventure'],
    ratings: { simkl: { rating: 8.54, votes: 1161 } },
    ids: {
      simkl_id: 2604475,
      slug: 'the-odyssey',
      imdb: 'tt33764258',
      tmdb: '1368337',
      tvdb: '362547',
    },
  };

  test('a trending movie becomes a feed-card-viable MOVIE item', () => {
    const item = normalizeTrendingItem(movie, 'movies', NOW);
    expect(item).toMatchObject({
      id: 'simkl-2604475',
      title: 'The Odyssey',
      coverImage: 'https://simkl.in/posters/20/20233461737b3bf5ec_m.webp',
      backdropImage: 'https://simkl.in/fanart/20/20397495e29a88fd8d_mobile.webp',
      overview: 'Odysseus sails home.',
      year: 2026,
      genres: ['Adventure'],
      rating: 8.54,
      type: 'MOVIE',
      // MM/DD/YYYY is a calendar date, not an instant — re-expressed as the
      // bare ISO date the NormalizedMediaItem contract names.
      releaseDate: '2026-07-15',
      lastUpdated: NOW,
      externalIds: { simkl: 2604475, tmdb: 1368337, tvdb: 362547, imdb: 'tt33764258' },
    });
  });

  test('a trending show maps to TV with its episode count', () => {
    const item = normalizeTrendingItem(
      {
        title: 'House of the Dragon',
        poster: '12/127230752d75bc8c3a',
        total_episodes: 26,
        ids: { simkl_id: 1197910, tmdb: '94997' },
      },
      'tv',
      NOW,
    );
    expect(item!.type).toBe('TV');
    expect(item!.totalEpisodes).toBe(26);
  });

  test('a trending anime film is ANIME + isFilm with mal/anilist ids', () => {
    const item = normalizeTrendingItem(
      {
        title: 'Demon Slayer: Infinity Castle',
        poster: '24/24b1c1',
        anime_type: 'movie',
        ids: { simkl_id: 2498112, mal: '59192', anilist: '178788' },
      },
      'anime',
      NOW,
    );
    expect(item!.type).toBe('ANIME');
    expect(item!.isFilm).toBe(true);
    expect(item!.externalIds.mal).toBe(59192);
    expect(item!.externalIds.anilist).toBe(178788);
  });

  test('items without a simkl id drop', () => {
    expect(normalizeTrendingItem({ title: 'Ghost' }, 'movies', NOW)).toBeNull();
  });
});

describe('normalizeSearchIdMatch', () => {
  test('a tv match yields a TV item keyed by its simkl id', () => {
    const raw: SimklSearchIdMatch = {
      type: 'tv',
      title: 'Breaking Bad',
      poster: '46/4677844b',
      year: 2008,
      total_episodes: 62,
      ids: { simkl: 46021, slug: 'breaking-bad' },
    };
    const item = normalizeSearchIdMatch(raw, NOW);
    expect(item).toMatchObject({
      id: 'simkl-46021',
      title: 'Breaking Bad',
      type: 'TV',
      totalEpisodes: 62,
      externalIds: { simkl: 46021 },
    });
  });

  test('an anime movie match sets isFilm and lifts the mal id', () => {
    const item = normalizeSearchIdMatch(
      {
        type: 'anime',
        title: 'Perfect Blue',
        anime_type: 'movie',
        mal: { id: '437' },
        ids: { simkl: 46020, slug: 'perfect-blue' },
      },
      NOW,
    );
    expect(item!.type).toBe('ANIME');
    expect(item!.isFilm).toBe(true);
    expect(item!.externalIds.mal).toBe(437);
  });

  test('unknown row types and id-less rows drop', () => {
    expect(normalizeSearchIdMatch({ type: 'episode', title: 'X' }, NOW)).toBeNull();
    expect(normalizeSearchIdMatch({ type: 'movie', title: 'X', ids: {} }, NOW)).toBeNull();
  });
});

describe('normalizeActivities', () => {
  test('parses the per-bucket delta timestamps', () => {
    const raw: SimklActivitiesRaw = {
      all: '2026-07-30T06:50:38Z',
      tv_shows: {
        all: '2026-07-29T10:00:00Z',
        removed_from_list: '2026-07-01T00:00:00Z',
      },
      anime: { all: null, removed_from_list: null },
      movies: { all: '2026-07-30T06:50:38Z', removed_from_list: null },
    };
    expect(normalizeActivities(raw)).toEqual({
      all: '2026-07-30T06:50:38Z',
      tvShows: {
        all: '2026-07-29T10:00:00Z',
        removedFromList: '2026-07-01T00:00:00Z',
      },
      anime: { all: null, removedFromList: null },
      movies: { all: '2026-07-30T06:50:38Z', removedFromList: null },
    });
  });

  test('missing buckets degrade to null timestamps', () => {
    expect(normalizeActivities({})).toEqual({
      all: null,
      tvShows: { all: null, removedFromList: null },
      anime: { all: null, removedFromList: null },
      movies: { all: null, removedFromList: null },
    });
  });
});

describe('normalizeUserSettings', () => {
  test('lifts the username and account facts', () => {
    const raw: SimklUserSettingsRaw = {
      user: { name: 'gian', avatar: 'https://simkl.in/avatars/1/1_100.jpg' },
      account: { id: 12345, timezone: 'America/Argentina/Buenos_Aires', type: 'free' },
    };
    expect(normalizeUserSettings(raw)).toEqual({
      username: 'gian',
      avatar: 'https://simkl.in/avatars/1/1_100.jpg',
      accountId: 12345,
      timezone: 'America/Argentina/Buenos_Aires',
    });
  });

  test('degrades to a null username, never throws', () => {
    expect(normalizeUserSettings({})).toEqual({ username: null });
  });
});
