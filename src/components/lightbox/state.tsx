import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

import type { ActiveLightbox, LightboxImage } from '@/components/lightbox/types';

type OpenArgs = { images: LightboxImage[]; index?: number };

/**
 * Global lightbox state, mirroring bluesky-social's `Lightbox/state.tsx`: the
 * tapped thumbnail and the fullscreen viewer are fully decoupled — a trigger
 * calls `openLightbox`, the root `<Lightbox />` renders whatever is active.
 * This is what lets the web viewer be a plain fade/zoom-in overlay instead of
 * a framer-motion shared-element morph (which ballooned into a giant circle on
 * unzoom — see components/zoomable-image). Native never touches this: galeria
 * owns the iOS/Android viewer inline (ZoomableImage's native file).
 */
const LightboxContext = createContext<{ activeLightbox: ActiveLightbox | null }>({
  activeLightbox: null,
});

const LightboxControlContext = createContext<{
  openLightbox: (args: OpenArgs) => void;
  closeLightbox: () => void;
}>({
  openLightbox: () => {},
  closeLightbox: () => {},
});

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [activeLightbox, setActiveLightbox] = useState<ActiveLightbox | null>(null);
  const idRef = useRef(0);

  // React Compiler memoizes these — no manual useCallback/useMemo (oxlint-banned).
  const openLightbox = ({ images, index = 0 }: OpenArgs) => {
    // Ignore re-opens while one is showing; the user closes the current first
    // (bluesky parity — avoids a second lightbox stacking on the first).
    setActiveLightbox((prev) =>
      prev ? prev : { id: String((idRef.current += 1)), images, index },
    );
  };
  const closeLightbox = () => setActiveLightbox(null);

  return (
    <LightboxContext.Provider value={{ activeLightbox }}>
      <LightboxControlContext.Provider value={{ openLightbox, closeLightbox }}>
        {children}
      </LightboxControlContext.Provider>
    </LightboxContext.Provider>
  );
}

export function useLightbox() {
  return useContext(LightboxContext);
}

export function useLightboxControls() {
  return useContext(LightboxControlContext);
}
