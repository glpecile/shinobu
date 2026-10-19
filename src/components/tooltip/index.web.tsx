import { useId, useRef, type ReactNode } from 'react';
import { Text, View } from 'react-native';

/** Gap between the target and the bubble, and the bubble's minimum inset from the window edge. */
const GAP = 6;

/**
 * A hover label above its target. The bubble is a manual popover, so it sits
 * in the top layer: rail clipping and transformed ancestors (`SectionEnter`)
 * can't cut it off or offset it. It flips below when there's no room above and
 * is clamped inside the window, so edge cells keep their label on screen.
 * `fill` makes the wrapper take its parent's space, for a target that is a
 * whole cell rather than a hugging control.
 */
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

  function show(event: React.PointerEvent<HTMLDivElement>) {
    const popover = bubble.current;
    if (popover == null || event.pointerType === 'touch') return;
    popover.showPopover();
    const target = event.currentTarget.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = popover;
    const left = target.left + target.width / 2 - width / 2;
    const above = target.top - height - GAP;
    popover.style.left = `${Math.min(Math.max(left, GAP), window.innerWidth - width - GAP)}px`;
    popover.style.top = `${above >= GAP ? above : target.bottom + GAP}px`;
  }

  return (
    <div
      aria-describedby={id}
      onPointerEnter={show}
      onPointerLeave={() => bubble.current?.hidePopover()}
      // A column like RN's View: in a row, RN Web's unshrinkable child would
      // take its one-line width and spill past a narrow parent.
      style={{ display: fill ? 'flex' : 'inline-flex', flexDirection: 'column', flex: fill ? 1 : undefined }}
    >
      {children}
      <div
        id={id}
        popover="manual"
        ref={bubble}
        role="tooltip"
        // Clears the UA popover box (centred, bordered, canvas-coloured).
        style={{
          position: 'fixed',
          inset: 'auto',
          margin: 0,
          padding: 0,
          border: 'none',
          background: 'transparent',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        <View className="bg-toast-surface border border-border rounded-lg px-2.5 py-1.5 shadow-md">
          <Text className="text-foreground font-sans text-xs" numberOfLines={1}>{label}</Text>
        </View>
      </div>
    </div>
  );
}
