import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, expect, test } from 'bun:test';
import type { PointerEvent } from 'react-native';

GlobalRegistrator.register();
afterAll(() => GlobalRegistrator.unregister());
const { act, render } = await import('@testing-library/react');
const { usePointerHover } = await import('./use-pointer-hover');

test('usePointerHover attaches listeners only on web, ignores touch, and drops hover when key changes', () => {
  const prevOs = process.env.EXPO_OS;
  let latest: ReturnType<typeof usePointerHover> | undefined;
  function Probe({ itemKey }: { itemKey: string }) {
    latest = usePointerHover(itemKey);
    return null;
  }

  try {
    process.env.EXPO_OS = 'ios';
    const nativeView = render(<Probe itemKey="a" />);
    expect(latest!.hovered).toBe(false);
    expect(Object.keys(latest!.hoverProps)).toEqual([]);
    nativeView.unmount();

    process.env.EXPO_OS = 'web';
    const webView = render(<Probe itemKey="a" />);
    expect('onPointerMove' in latest!.hoverProps).toBe(true);
    expect('onPointerEnter' in latest!.hoverProps).toBe(false);

    act(() =>
      latest!.hoverProps.onPointerMove?.({ nativeEvent: { pointerType: 'touch' } } as PointerEvent),
    );
    expect(latest!.hovered).toBe(false);

    act(() =>
      latest!.hoverProps.onPointerMove?.({ nativeEvent: { pointerType: 'mouse' } } as PointerEvent),
    );
    expect(latest!.hovered).toBe(true);

    webView.rerender(<Probe itemKey="b" />);
    expect(latest!.hovered).toBe(false);
    webView.unmount();
  } finally {
    if (prevOs === undefined) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = prevOs;
  }
});
