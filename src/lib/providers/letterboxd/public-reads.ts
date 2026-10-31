import * as Semaphore from 'effect/Semaphore';

// A conservative application ceiling, not a measured Letterboxd quota.
export const letterboxdPublicReads = Semaphore.makeUnsafe(4);
