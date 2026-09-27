/**
 * Shared rate-limit retry policy for provider HTTP layers.
 *
 * A tap or a details screen must not hang for a long Retry-After. Providers
 * that send a short cooldown get one retry; anything longer surfaces as a
 * rate-limit error instead of blocking the UI.
 */
export const RATE_LIMIT_MAX_RETRY_DELAY_MS = 5_000;

/** Fallback cooldown when a provider rate-limits without a Retry-After. */
export const RATE_LIMIT_DEFAULT_RETRY_AFTER_MS = 1_000;
