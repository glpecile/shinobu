import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { CSS_EASE_OUT, DURATION } from '@/lib/motion';

import './tooltip-motion.css';

const GAP = 6;
const OPEN_DELAY = 500;
const WARM_WINDOW = 300;
const MOTION_VARS = {
  '--tooltip-enter': `${DURATION.enter}ms`,
  '--tooltip-exit': `${DURATION.exit}ms`,
  '--tooltip-ease': CSS_EASE_OUT,
} as CSSProperties;

let warmUntil = 0;

export function Tooltip({
  label,
  fill = false,
  children,
}: {
  label: string;
  fill?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const bubble = useRef<HTMLDivElement>(null);
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollCleanup = useRef<AbortController | null>(null);
  const lastTouch = useRef(0);

  function cancelScroll() {
    scrollCleanup.current?.abort();
    scrollCleanup.current = null;
  }

  function hide(warm = false) {
    clearTimeout(pending.current);
    cancelScroll();
    const popover = bubble.current;
    if (popover?.matches(':popover-open') !== true) return;
    popover.hidePopover();
    if (warm) warmUntil = Date.now() + WARM_WINDOW;
  }

  function watchScroll() {
    cancelScroll();
    const controller = new AbortController();
    scrollCleanup.current = controller;
    window.addEventListener('scroll', () => hide(), {
      capture: true,
      once: true,
      signal: controller.signal,
    });
  }

  function show(target: HTMLDivElement, instant: boolean) {
    clearTimeout(pending.current);
    const popover = bubble.current;
    if (popover == null || label === '') return;
    popover.toggleAttribute('data-instant', instant);
    popover.showPopover();
    const bounds = target.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = popover;
    const left = bounds.left + bounds.width / 2 - width / 2;
    const above = bounds.top - height - GAP;
    popover.dataset.side = above >= GAP ? 'top' : 'bottom';
    popover.style.left = `${Math.max(GAP, Math.min(left, window.innerWidth - width - GAP))}px`;
    popover.style.top = `${above >= GAP ? above : bounds.bottom + GAP}px`;
    watchScroll();
  }

  useEffect(
    () => () => {
      clearTimeout(pending.current);
      cancelScroll();
    },
    [],
  );

  return (
    <div
      aria-describedby={id}
      onPointerEnter={(event) => {
        if (event.pointerType === 'touch' || Date.now() - lastTouch.current < 50) return;
        clearTimeout(pending.current);
        const target = event.currentTarget;
        watchScroll();
        if (Date.now() < warmUntil) show(target, true);
        else pending.current = setTimeout(() => show(target, false), OPEN_DELAY);
      }}
      onPointerDown={() => hide()}
      onPointerUp={(event) => {
        if (event.pointerType === 'touch') lastTouch.current = Date.now();
      }}
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) hide(true);
        else clearTimeout(pending.current);
      }}
      onFocus={(event) => {
        if (event.target instanceof HTMLElement && event.target.matches(':focus-visible'))
          show(event.currentTarget, true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) hide();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') hide();
      }}
      // A column like RN's View: in a row, RN Web's unshrinkable child would
      // take its one-line width and spill past a narrow parent.
      style={{
        display: fill ? 'flex' : 'inline-flex',
        flexDirection: 'column',
        flex: fill ? 1 : undefined,
      }}
    >
      {children}
      <div
        data-shinobu-tooltip=""
        id={id}
        popover="manual"
        ref={bubble}
        role="tooltip"
        // Clears the UA popover box (centred, bordered, canvas-coloured).
        style={{
          ...MOTION_VARS,
          position: 'fixed',
          inset: 'auto',
          margin: 0,
          padding: 0,
          border: 'none',
          background: 'transparent',
          overflow: 'visible',
          pointerEvents: 'none',
          maxWidth: `calc(100vw - ${GAP * 2}px)`,
        }}
      >
        <View className="max-w-full bg-toast-surface border border-border rounded-lg px-2.5 py-1.5 shadow-md">
          <Text className="text-foreground font-sans text-xs" numberOfLines={1}>
            {label}
          </Text>
        </View>
      </div>
    </div>
  );
}
