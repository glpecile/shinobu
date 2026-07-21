/**
 * A zoomable image, decoupled from the on-screen thumbnail that triggered it.
 * The lightbox provider holds these; the viewer renders them. Modelled on
 * bluesky-social's `Lightbox/types.ts` (adapted — no post/metrics context, no
 * native shared-element rect since galeria owns the native viewer).
 */
export type LightboxImage = {
  /** Full-resolution source shown in the viewer. */
  uri: string;
  /** Accessibility label / description for the image. */
  alt?: string;
  /**
   * Shape hint for the web viewer: `image` fills the screen (contain-fit),
   * `circle-avi` / `rect-avi` render as a capped, cropped avatar. Native
   * ignores this — galeria owns the iOS/Android presentation.
   */
  type: 'image' | 'circle-avi' | 'rect-avi';
};

/** The currently-open lightbox: a set of images and which one is showing. */
export type ActiveLightbox = {
  /** Fresh per open — used as the viewer's remount `key`. */
  id: string;
  images: LightboxImage[];
  index: number;
};
