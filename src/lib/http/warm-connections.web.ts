import type { ProviderId } from '@/lib/providers/types';

/**
 * No-op on web: the browser owns its own connection pool and there is no
 * nitro-fetch. The native sibling (`warm-connections.ts`) warms Cronet/URLSession
 * connections ahead of the Up Next request waterfall.
 */
export function warmProviderConnections(_connected: readonly ProviderId[]): void {}
