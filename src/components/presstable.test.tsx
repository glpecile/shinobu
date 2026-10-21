import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { expect, mock, spyOn, test } from 'bun:test';
import { createElement, type ComponentProps } from 'react';

GlobalRegistrator.register();
const { fireEvent, render } = await import('@testing-library/react');

function NativePressable({ onPress }: { onPress?: () => void }) {
  return <button onClick={onPress}>Press</button>;
}
mock.module('pressto', () => ({
  createAnimatedPressable: () => NativePressable,
  PressableOpacity: NativePressable,
}));
mock.module('react-native-reanimated', () => ({ interpolate: () => 1 }));
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
