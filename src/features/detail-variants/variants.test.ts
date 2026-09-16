import { describe, expect, it } from 'bun:test';

import { detailVariants } from './variants';

describe('detailVariants', () => {
  it('lists the TMDB and AniList pages of a Trakt-sourced anime show', () => {
    expect(
      detailVariants({ id: 'trakt-1', type: 'TV', externalIds: { trakt: 1, tmdb: 209867, anilist: 154587 } }),
    ).toEqual([
      { source: 'tmdb', id: 'tmdb-tv-209867' },
      { source: 'anilist', id: 'anilist-154587' },
    ]);
  });

  it('leaves out the page being viewed', () => {
    expect(
      detailVariants({ id: 'anilist-199', type: 'ANIME', isFilm: true, externalIds: { anilist: 199, tmdb: 129 } }),
    ).toEqual([{ source: 'tmdb', id: 'tmdb-movie-129' }]);
  });

  it('never mints a TMDB page for manga', () => {
    expect(detailVariants({ id: 'anilist-30013', type: 'MANGA', externalIds: { anilist: 30013, tmdb: 1 } })).toEqual([]);
  });
});
