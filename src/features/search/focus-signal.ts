const listeners = new Set<() => void>();
let pending = false;

export function emitSearchFocusRequest(): void {
  pending = listeners.size === 0;
  for (const listener of listeners) listener();
}

export function onSearchFocusRequest(onRequest: () => void): () => void {
  listeners.add(onRequest);
  if (pending) {
    pending = false;
    onRequest();
  }
  return () => listeners.delete(onRequest);
}
