import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

import type { ActiveLightbox, LightboxImage } from '@/components/lightbox/types';

type OpenArgs = { images: LightboxImage[]; index?: number };

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

  const openLightbox = ({ images, index = 0 }: OpenArgs) => {
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
