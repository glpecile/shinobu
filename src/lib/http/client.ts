import { fetch as nitroFetch } from 'react-native-nitro-fetch';

import { fetchWithLaunchReplay } from './launch-replay';
export { endLaunchReplay } from './launch-replay';
import type { HttpFetch } from './types';

// Nitro-fetch is WHATWG-compatible (Cronet/URLSession under the hood) but its
// TS types name Nitro-specific Request/Response classes; the runtime shapes
// match what the provider layer consumes (status/headers/json).
const nitro = nitroFetch as unknown as HttpFetch;

export const httpFetch: HttpFetch = (input, init) => fetchWithLaunchReplay(nitro, input, init);
