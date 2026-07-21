/**
 * Native renders nothing. On iOS/Android galeria owns the zoom viewer inline
 * inside ZoomableImage (its shared-element transition is already polished), so
 * the decoupled provider path is web-only — see index.web.tsx. The provider
 * (`state.tsx`) still mounts on native for a uniform tree; it just goes unused.
 */
export function Lightbox() {
  return null;
}
