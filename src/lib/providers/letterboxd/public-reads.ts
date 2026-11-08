import * as Semaphore from 'effect/Semaphore';

// Measured 2026-11-08 (docs/solutions/letterboxd-list-public-read-fan.md):
// request latency stayed flat from 4 to 12 parallel reads, with no 429s.
export const letterboxdPublicReads = Semaphore.makeUnsafe(8);
