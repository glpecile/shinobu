import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { expect, mock, spyOn, test } from 'bun:test';
import { createElement, type ComponentProps } from 'react';

GlobalRegistrator.register();
const { fireEvent, render } = await import('@testing-library/react');

let reduceMotion = false;

function NativePressable({ onPress }: { onPress?: () => void }) {
  return <button onClick={onPress}>Press</button>;
}
mock.module('pressto', () => ({
  createAnimatedPressable: (animate: (progress: number, options: object) => { opacity?: number; transform?: { scale: number }[] }) =>
    function ScalePressable({ metadata, onPress }: { metadata: object; onPress?: () => void }) {
      const style = animate(1, { metadata, config: { baseScale: 1, minScale: 0.96, activeOpacity: 0.6 } });
      return <button onClick={onPress} style={{ opacity: style.opacity, transform: style.transform == null ? undefined : `scale(${style.transform[0].scale})` }}>Press</button>;
    },
  PressableOpacity: NativePressable,
}));
mock.module('react-native-reanimated', () => ({
  interpolate: (value: number, _input: number[], output: number[]) => output[0] + value * (output[1] - output[0]),
  useReducedMotion: () => reduceMotion,
}));
mock.module('@/lib/with-uniwind', () => ({ withUniwind: (component: unknown) => component }));
const { PresstableOpacity, PresstableScale } = await import('./presstable');

for (const Pressable of [PresstableOpacity, PresstableScale]) {
  test(`${Pressable.name} allows immediate repeats and keeps default repeat protection`, () => {
    let now = 1000;
    const clock = spyOn(Date, 'now').mockImplementation(() => now);
    const onPress = mock(() => {});
    const props = { onPress } as ComponentProps<typeof PresstableOpacity>;
    const view = render(createElement(Pressable, props));
    try {
      const button = view.getByRole('button');
      fireEvent.click(button);
      now += 100;
      fireEvent.click(button);
      expect(onPress).toHaveBeenCalledTimes(1);
      now += 400;
      fireEvent.click(button);
      expect(onPress).toHaveBeenCalledTimes(2);

      view.rerender(createElement(Pressable, { ...props, pressBehavior: 'immediate' }));
      fireEvent.click(button);
      now += 100;
      fireEvent.click(button);
      expect(onPress).toHaveBeenCalledTimes(4);
    } finally {
      view.unmount();
      clock.mockRestore();
    }
  });
}

test('card presses keep feedback without scaling under reduced motion', () => {
  const view = render(<PresstableScale minScale={0.98} />);
  try {
    const button = view.getByRole('button');
    expect(button.style.transform).toBe('scale(0.98)');
    reduceMotion = true;
    view.rerender(<PresstableScale minScale={0.98} />);
    expect(button.style.transform).toBe('');
    expect(button.style.opacity).toBe('0.6');
  } finally {
    reduceMotion = false;
    view.unmount();
  }
});
