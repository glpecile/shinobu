import { Data } from 'effect';

import type { ErrorSourceId } from './types';

/**
 * Tagged error vocabulary shared by every provider adapter. Each error carries
 * the `provider` it came from so the fan-out (`useLogMedia`) can surface
 * per-provider partial failure — never a collapsed boolean/throw (AGENTS.md).
 * Adapters map raw transport failures into one of these before anything above
 * `lib/providers/` sees them.
 */
// Each subclass defines a `message` getter so the value survives the trip
// through the fan-out, which reads `error.message` (fan-out.ts) — without it
// `Data.TaggedError` yields an empty message and every failure collapses to a
// generic "Failed on <provider>" with no cause. The message is diagnostic
// (carries the provider id + specifics); friendly copy lives at the UI layer.
export class ProviderAuthError extends Data.TaggedError('ProviderAuthError')<{
  readonly provider: ErrorSourceId;
  /** True once a token refresh was attempted and also failed — session is dead. */
  readonly refreshFailed: boolean;
}> {
  get message() {
    return `${this.provider}: session expired or was rejected — reconnect ${this.provider}`;
  }
}

export class ProviderRateLimitError extends Data.TaggedError(
  'ProviderRateLimitError',
)<{
  readonly provider: ErrorSourceId;
  /** From the provider's Retry-After (or equivalent), when it sends one. */
  readonly retryAfterMs?: number;
}> {
  get message() {
    return `${this.provider}: rate limited — try again shortly`;
  }
}

export class ProviderNetworkError extends Data.TaggedError(
  'ProviderNetworkError',
)<{
  readonly provider: ErrorSourceId;
  readonly cause: unknown;
  /**
   * The HTTP status, when the failure *is* an HTTP response (absent for
   * DNS/timeout/abort). Lets a caller distinguish a semantic negative — e.g.
   * Serializd's progress endpoint answering 404 for "no progress recorded"
   * (plan 0031 KTD-10) — from an outage, without parsing the message string.
   */
  readonly status?: number;
}> {
  get message() {
    const detail =
      this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `${this.provider}: network error — ${detail}`;
  }
}

/** A response that failed to decode into the `NormalizedMediaItem` contract. */
export class ProviderDecodeError extends Data.TaggedError('ProviderDecodeError')<{
  readonly provider: ErrorSourceId;
  readonly detail: string;
}> {
  get message() {
    return `${this.provider}: ${this.detail}`;
  }
}

export type ProviderError =
  | ProviderAuthError
  | ProviderRateLimitError
  | ProviderNetworkError
  | ProviderDecodeError;
