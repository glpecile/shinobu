# galeria's web zoom morph balloons into a giant circle

## Symptom

On **web**, tapping a zoomable image (person headshot, details poster) opened
fine, but on **unzoom** the image ballooned into a huge circle that swept across
the page content before snapping back to the small thumbnail. Only web — native
(iOS/Android) was clean.

## Cause

`@nandorojo/galeria` ships a completely different implementation per platform.
Its **web** build (`GaleriaView.tsx`) does a framer-motion `layoutId`
shared-element **morph** between two elements that share an id: the thumbnail
(`motion.div`) and the fullscreen image (`motion.img`). Two things break it for
a circular avatar:

1. **Aspect-ratio mismatch.** Our thumbnail is a square, cover-cropped circle
   (`w-28 h-28 rounded-full`) but the zoom source (`headshotFull`) is a portrait
   image. galeria itself `console.error`s about this exact case ("does not have
   the same aspect ratio as its child… might result in a weird animation").
2. **Border-radius + size morph.** On close, framer-motion animates the
   fullscreen image's size *and* `border-radius` back toward the little circle —
   mid-flight that's the giant circle sweeping across the page.

This is inherent to galeria's web transition; it fights the circular-avatar
design. galeria's native path is a real shared-element and looks right.

## Fix

Decouple the trigger from the viewer on web (the bluesky-social `Lightbox`
pattern), so there's no `layoutId` morph at all:

- `components/lightbox/state.tsx` — a global provider holding one
  `activeLightbox`; `openLightbox` / `closeLightbox`.
- `components/lightbox/index.web.tsx` — a fixed fullscreen `Modal` overlay that
  fades its backdrop in and **settles the image in** with a small 0.92 → 1
  scale + fade (a `Keyframe` on easeOutQuint — never `ZoomIn`'s scale-from-0;
  reduced-motion drops the scale to a plain fade; deferred unmount like
  `components/sheet/index.web.tsx`). Closes on
  backdrop tap, X button, `Escape`, or browser-back. `image` fills the screen
  contain-fit; `circle-avi` / `rect-avi` render as a **square, viewport-capped
  cover-crop** (`min(400px, 90vw, 90vh)`) so a portrait headshot becomes a real
  circle, not an ellipse.
- `components/lightbox/index.tsx` — native renders `null`; galeria still owns the
  native viewer inline.
- `components/zoomable-image/index.web.tsx` — a thin trigger calling
  `openLightbox`; `index.tsx` keeps the galeria wrapper for native.

Kept galeria on native (its shared-element is already polished, and its
wrapper API can't be driven imperatively from a decoupled `openLightbox`). The
trigger model just differs per platform — that's the platform-file convention
working as intended. JS-only change: hot reload, no native rebuild.

## Takeaway

galeria's web build is a framer-motion shared-element morph, not a plain
lightbox — it only behaves for same-aspect-ratio, non-rounded images. For
avatars or any thumbnail whose shape ≠ the zoom source, route web through the
decoupled lightbox provider instead.
