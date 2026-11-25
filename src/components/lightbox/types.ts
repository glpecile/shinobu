export type LightboxImage = {
  uri: string;
  alt?: string;
  /** Web-only shape hint (`image` contain-fits; avatars cover-crop); ignored on native. */
  type: 'image' | 'circle-avi' | 'rect-avi';
};

export type ActiveLightbox = {
  id: string;
  images: LightboxImage[];
  index: number;
};
