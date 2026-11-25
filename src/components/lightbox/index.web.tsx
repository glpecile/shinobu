import Ionicons from '@react-native-vector-icons/ionicons/static';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';
import {
  FadeIn,
  FadeOut,
  Keyframe,
  useReducedMotion,
} from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Image } from '@/components/image';
import { useLightbox, useLightboxControls } from '@/components/lightbox/state';
import { PresstableOpacity } from '@/components/presstable';
import { RoundIconButton } from '@/components/round-icon-button';
import { KEYFRAME_EASE_EXIT, KEYFRAME_EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

const EXIT_MS = 200;

/** Timing-based keyframe (Reanimated springs don't run on web). */
const imageEntering = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.92 }] },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: KEYFRAME_EASE_OUT,
  },
}).duration(260);

const imageExiting = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: {
    opacity: 0,
    transform: [{ scale: 0.96 }],
    easing: KEYFRAME_EASE_EXIT,
  },
}).duration(EXIT_MS);

export function Lightbox() {
  const { activeLightbox } = useLightbox();
  const { closeLightbox } = useLightboxControls();
  const foreground = useThemeColor('--color-foreground');
  const reduceMotion = useReducedMotion();

  const [shown, setShown] = useState(activeLightbox);
  if (activeLightbox != null && activeLightbox !== shown) setShown(activeLightbox);
  useEffect(() => {
    if (activeLightbox != null) return;
    const timer = setTimeout(() => setShown(null), EXIT_MS);
    return () => clearTimeout(timer);
  }, [activeLightbox]);

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
            <PresstableOpacity
              accessibilityLabel="Close image viewer"
              className="absolute inset-0"
              onPress={closeLightbox}
            />
            <AnimatedView
              className="absolute inset-0 bg-black"
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(EXIT_MS)}
              style={{ pointerEvents: 'none' }}
            />
            <View
              className="absolute inset-0 items-center justify-center p-4"
              style={{ pointerEvents: 'none' }}
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
                  // Raw <img> so width/height can use CSS viewport units.
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
              <RoundIconButton
                icon={<Ionicons color={foreground} name="close" size={22} />}
                label="Close image viewer"
                onPress={closeLightbox}
              />
            </AnimatedView>
          </>
        )}
      </View>
    </Modal>
  );
}

function avatarStyle(type: 'circle-avi' | 'rect-avi') {
  const size = 'min(400px, 90vw, 90vh)';
  return {
    width: size,
    height: size,
    objectFit: 'cover',
    borderRadius: type === 'circle-avi' ? '50%' : '10%',
  } as CSSProperties;
}
