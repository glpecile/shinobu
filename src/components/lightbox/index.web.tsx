import Ionicons from '@react-native-vector-icons/ionicons/static';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';
import {
  Easing,
  FadeIn,
  FadeOut,
  Keyframe,
  useReducedMotion,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { Image } from '@/components/image';
import { useLightbox, useLightboxControls } from '@/components/lightbox/state';
import { PresstableOpacity } from '@/components/presstable';

/** Exit motion runs this long before the Modal unmounts — keep in sync below. */
const EXIT_MS = 200;

/**
 * settle-in for the image: fade up with a small 0.92 → 1 scale — never from
 * scale(0), which reads as a dot exploding out of nowhere (the old ZoomIn
 * preset did exactly that). cubic-bezier(0.23, 1, 0.32, 1) is the strong
 * ease-out (easeOutQuint); built-in weaker curves feel sluggish. Timing-based
 * keyframes, not springs: springs don't run on web. Module scope per
 * Reanimated's animation-builder performance rule.
 */
const imageEntering = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.92 }] },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.bezier(0.23, 1, 0.32, 1),
  },
}).duration(260);

/** Asymmetric exit: faster than the enter, ease-out so close responds at once. */
const imageExiting = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: {
    opacity: 0,
    transform: [{ scale: 0.96 }],
    easing: Easing.out(Easing.quad),
  },
}).duration(EXIT_MS);

/**
 * Web image viewer, adapted from bluesky-social's `Lightbox.web.tsx`. A fixed
 * fullscreen overlay that fades its backdrop in and zoom-fades the image up —
 * deliberately NOT a shared-element morph from the thumbnail (galeria's web
 * build did that and ballooned into a giant circle on unzoom). Closes on
 * backdrop tap, the X button, Escape, or browser-back.
 *
 * `image` fills the screen contain-fit; `circle-avi` / `rect-avi` render as a
 * capped, cover-cropped avatar so a portrait headshot zooms to a real circle
 * rather than an ellipse.
 */
export function Lightbox() {
  const { activeLightbox } = useLightbox();
  const { closeLightbox } = useLightboxControls();
  const foreground = useCSSVariable('--color-foreground');
  const reduceMotion = useReducedMotion();

  // Retain the last shown lightbox so the exit animation still has an image to
  // fade out after `activeLightbox` clears (same deferred-unmount trick as
  // components/sheet/index.web.tsx).
  const [shown, setShown] = useState(activeLightbox);
  useEffect(() => {
    if (activeLightbox != null) {
      setShown(activeLightbox);
      return;
    }
    const timer = setTimeout(() => setShown(null), EXIT_MS);
    return () => clearTimeout(timer);
  }, [activeLightbox]);

  // Escape closes; browser-back closes instead of navigating away (bluesky
  // pushes a history entry on open and pops it on close).
  const closedByPopRef = useRef(false);
  useEffect(() => {
    if (activeLightbox == null) return;
    closedByPopRef.current = false;
    history.pushState({ lightbox: true }, '');

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
    };
    const onPopState = () => {
      closedByPopRef.current = true;
      closeLightbox();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', onPopState);
      // Only pop our own entry, and not when a popstate already did it.
      const state = history.state as { lightbox?: boolean } | null;
      if (!closedByPopRef.current && state?.lightbox) history.back();
    };
  }, [activeLightbox, closeLightbox]);

  if (shown == null) return null;

  const open = activeLightbox != null;
  const image = shown.images[shown.index];

  return (
    <Modal animationType="none" onRequestClose={closeLightbox} transparent visible>
      <View className="flex-1">
        {open && image != null && (
          <>
            {/* Full-screen tap target; the layers above sit at pointerEvents
                none so a tap anywhere falls through to here and closes. */}
            <PresstableOpacity
              accessibilityLabel="Close image viewer"
              className="absolute inset-0"
              onPress={closeLightbox}
            />
            <AnimatedView
              className="absolute inset-0 bg-black"
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(EXIT_MS)}
              pointerEvents="none"
            />
            <View
              className="absolute inset-0 items-center justify-center p-4"
              pointerEvents="none"
            >
              <AnimatedView
                className={image.type === 'image' ? 'w-full h-full' : ''}
                entering={reduceMotion ? FadeIn.duration(200) : imageEntering}
                exiting={reduceMotion ? FadeOut.duration(EXIT_MS) : imageExiting}
              >
                {image.type === 'image' ? (
                  <Image
                    alt={image.alt}
                    className="w-full h-full"
                    contentFit="contain"
                    source={{ uri: image.uri }}
                  />
                ) : (
                  // Raw <img> so the caps can use viewport units (like bluesky's
                  // avatars); a square cover-crop turns a portrait into a circle.
                  <img
                    alt={image.alt ?? ''}
                    src={image.uri}
                    style={avatarStyle(image.type)}
                  />
                )}
              </AnimatedView>
            </View>
            <AnimatedView
              className="absolute top-6 right-6"
              entering={FadeIn.delay(120).duration(200)}
              exiting={FadeOut.duration(EXIT_MS)}
            >
              <PresstableOpacity
                accessibilityLabel="Close image viewer"
                className="w-10 h-10 rounded-full bg-surface/90 border border-border items-center justify-center"
                onPress={closeLightbox}
              >
                <Ionicons
                  color={typeof foreground === 'string' ? foreground : undefined}
                  name="close"
                  size={22}
                />
              </PresstableOpacity>
            </AnimatedView>
          </>
        )}
      </View>
    </Modal>
  );
}

/** Square, viewport-capped avatar box — cover-crops the source to the shape. */
function avatarStyle(type: 'circle-avi' | 'rect-avi') {
  const size = 'min(400px, 90vw, 90vh)';
  return {
    width: size,
    height: size,
    objectFit: 'cover',
    borderRadius: type === 'circle-avi' ? '50%' : '10%',
  } as CSSProperties;
}
