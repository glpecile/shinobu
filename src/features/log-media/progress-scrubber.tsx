import { useRef } from 'react';
import { View } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';

import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { pageAt, percentRead, stepPage } from './reading-share';

const MARKS = [25, 50, 75];
const SNAP = 2;

export function ProgressScrubber({
  page,
  total,
  onChange,
  onStep,
  disabled,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  onStep: (by: 1 | -1) => void;
  disabled: boolean;
}) {
  const track = useRef({ x: 0, width: 0 });
  const snapped = useRef<number | null>(null);
  const share = (page / total) * 100;
  const percent = percentRead(page, total);

  function seek(x: number) {
    if (track.current.width === 0) return;
    const at = Math.min(100, Math.max(0, ((x - track.current.x) / track.current.width) * 100));
    const mark = [0, ...MARKS, 100].find((m) => Math.abs(at - m) < SNAP) ?? null;
    if (mark != null && mark !== snapped.current) haptics.selection();
    snapped.current = mark;
    onChange(pageAt(mark ?? at, total));
  }

  function jump(by: number) {
    onChange(stepPage(page, total, by, false));
  }

  const tap = useTapGesture({
    runOnJS: true,
    enabled: !disabled,
    onActivate: (event) => seek(event.x),
  });
  const pan = usePanGesture({
    runOnJS: true,
    enabled: !disabled,
    activeOffsetX: [-4, 4],
    failOffsetY: [-12, 12],
    onUpdate: (event) => seek(event.x),
    onFinalize: () => {
      snapped.current = null;
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        accessibilityLabel="Progress"
        accessibilityRole="adjustable"
        accessibilityState={{ disabled }}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: percent,
          text: `${percent}%, page ${page} of ${total}`,
        }}
        // Padded past the track by half the thumb, so the thumb at either end
        // sits inside the hit area. A child outside its parent gets no touches.
        className="-mx-3 h-11 px-3"
        focusable={!disabled}
        onAccessibilityAction={(event) => {
          if (!disabled) onStep(event.nativeEvent.actionName === 'increment' ? 1 : -1);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          const { key, shiftKey } = event.nativeEvent;
          switch (key) {
            case 'ArrowRight':
            case 'ArrowUp':
              if (shiftKey) jump(10);
              else onStep(1);
              break;
            case 'ArrowLeft':
            case 'ArrowDown':
              if (shiftKey) jump(-10);
              else onStep(-1);
              break;
            case 'PageUp':
              jump(10);
              break;
            case 'PageDown':
              jump(-10);
              break;
            case 'Home':
              onChange(0);
              break;
            case 'End':
              onChange(total);
              break;
            default:
              return;
          }
          event.preventDefault();
        }}
      >
        <View
          className="flex-1 justify-center"
          onLayout={(event) => {
            const { x, width } = event.nativeEvent.layout;
            track.current = { x, width };
          }}
        >
          <View className="h-1.5 rounded-full bg-border overflow-hidden">
            <View
              className={cn('h-full', page >= total ? 'bg-success' : 'bg-foreground')}
              style={{ width: `${share}%` }}
            />
          </View>
          {MARKS.map((mark) => (
            <View
              key={mark}
              className="absolute h-2 w-0.5 -ml-px bg-surface"
              style={{ left: `${mark}%` }}
            />
          ))}
          <View
            className="absolute size-6 -ml-3 rounded-full bg-foreground shadow-md"
            style={{ left: `${share}%` }}
          />
        </View>
      </View>
    </GestureDetector>
  );
}
