import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { ProviderDecodeError, type ProviderError } from '@/lib/providers/errors';
import { Provider } from '@/lib/providers/types';
import type { HardcoverDeps } from './deps';
import { hardcoverRequest } from './http';

const provider = Provider.Hardcover;

/** `me` answers with a one-row list. `read:me:content` covers these fields. */
const viewerData = Schema.Struct({
  me: Schema.Array(Schema.Struct({ id: Schema.Number, username: Schema.String })),
});

export interface HardcoverViewer {
  id: number;
  username: string;
}

/** The connected member. */
export function getViewer(deps: HardcoverDeps): Effect.Effect<HardcoverViewer, ProviderError> {
  return hardcoverRequest<unknown>(deps, 'query Viewer { me { id username } }').pipe(
    Effect.flatMap((data) =>
      Schema.decodeUnknownEffect(viewerData)(data).pipe(
        Effect.flatMap((decoded) => Effect.fromNullishOr(decoded.me[0])),
        Effect.mapError(() => new ProviderDecodeError({ provider, detail: 'invalid viewer response' })),
      ),
    ),
  );
}
