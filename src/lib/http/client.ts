import { fetch as nitroFetch } from 'react-native-nitro-fetch';

import type { HttpFetch } from './types';

// Nitro-fetch is WHATWG-compatible (Cronet/URLSession under the hood) but its
// TS types name Nitro-specific Request/Response classes; the runtime shapes
// match what the provider layer consumes (status/headers/json).
export const httpFetch: HttpFetch = nitroFetch as unknown as HttpFetch;
