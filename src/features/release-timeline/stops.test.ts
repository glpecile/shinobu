import { describe, expect, test } from 'bun:test';

import { releaseStops } from './stops';

// Local noon, not a UTC instant: `hasAired` parses a bare TMDB date as local
// midnight, so a UTC-anchored "now" would flip these assertions in timezones
// far enough east or west.
const NOW = new Date(2026, 6, 27, 12, 0, 0);

describe('releaseStops', () => {
  test('renders nothing without a calendar', () => {
    expect(releaseStops(undefined, NOW)).toEqual([]);
    expect(releaseStops({}, NOW)).toEqual([]);
  });

  test('orders stops by date and labels them by how you watch', () => {
    const stops = releaseStops(
      {
        theatrical: '2024-02-27',
        digital: '2024-04-16',
        physical: '2024-05-14',
      },
      NOW,
    );

    expect(stops.map((stop) => [stop.label, stop.date])).toEqual([
      ['In theaters', '2024-02-27'],
      ['Digital', '2024-04-16'],
      ['Physical', '2024-05-14'],
    ]);
    expect(stops.every((stop) => !stop.upcoming)).toBe(true);
    expect(stops.every((stop) => stop.relative == null)).toBe(true);
  });

  test('a date, not a kind, decides the order', () => {
    // A re-release can put physical media ahead of a (re-)theatrical run; the
    // rail has to read chronologically or the connector implies a false order.
    const stops = releaseStops(
      { theatrical: '2026-03-01', digital: '2025-11-04' },
      NOW,
    );
    expect(stops.map((stop) => stop.kind)).toEqual(['digital', 'theatrical']);
  });

  test('same-day releases fall back to how a film actually rolls out', () => {
    const stops = releaseStops(
      { physical: '2024-04-16', digital: '2024-04-16' },
      NOW,
    );
    expect(stops.map((stop) => stop.kind)).toEqual(['digital', 'physical']);
  });

  test('a future date is upcoming and carries a countdown', () => {
    const stops = releaseStops(
      { theatrical: '2026-06-12', digital: '2026-08-08' },
      NOW,
    );

    expect(stops[0]).toEqual({
      kind: 'theatrical',
      label: 'In theaters',
      date: '2026-06-12',
      upcoming: false,
    });
    expect(stops[1]).toEqual({
      kind: 'digital',
      label: 'Digital',
      date: '2026-08-08',
      upcoming: true,
      relative: 'In 12 days',
    });
  });

  test('a release landing today counts as released, not upcoming', () => {
    // `hasAired` compares against local midnight, so the whole release day is
    // already "out" — a countdown reading "Today" would contradict the log
    // button, which accepts the film from midnight on.
    const [stop] = releaseStops({ digital: '2026-07-27' }, NOW);
    expect(stop?.upcoming).toBe(false);
    expect(stop?.relative).toBeUndefined();
  });

  test('a single kind still yields a one-stop rail', () => {
    expect(releaseStops({ digital: '2026-01-05' }, NOW)).toHaveLength(1);
  });

  test('a value that is not a calendar day is dropped, not rendered', () => {
    expect(
      releaseStops(
        { theatrical: '2024-02-27T00:00:00.000Z', digital: 'soon' },
        NOW,
      ),
    ).toEqual([]);
  });
});
