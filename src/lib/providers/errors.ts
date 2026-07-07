import { Data } from 'effect';

import type { ProviderId } from './types';

/**
 * Tagged error vocabulary shared by every provider adapter. Each error carries
 * the `provider` it came from so the fan-out (`useLogMedia`) can surface
 * per-provider partial failure — never a collapsed boolean/throw (AGENTS.md).
 * Adapters map raw transport failures into one of these before anything above
 * `lib/providers/` sees them.
 */
export class ProviderAuthError extends Data.TaggedError('ProviderAuthError')<{
  readonly provider: ProviderId;
  /** True once a token refresh was attempted and also failed — session is dead. */
  readonly refreshFailed: boolean;
}> {}

export class ProviderRateLimitError extends Data.TaggedError(
  'ProviderRateLimitError',
)<{
  readonly provider: ProviderId;
  /** From the provider's Retry-After (or equivalent), when it sends one. */
  readonly retryAfterMs?: number;
}> {}

export class ProviderNetworkError extends Data.TaggedError(
  'ProviderNetworkError',
)<{
  readonly provider: ProviderId;
  readonly cause: unknown;
}> {}

/** A response that failed to decode into the `NormalizedMediaItem` contract. */
export class ProviderDecodeError extends Data.TaggedError('ProviderDecodeError')<{
  readonly provider: ProviderId;
  readonly detail: string;
}> {}

export type ProviderError =
  | ProviderAuthError
  | ProviderRateLimitError
  | ProviderNetworkError
  | ProviderDecodeError;
