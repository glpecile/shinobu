import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, expect, mock, spyOn, test } from 'bun:test';

GlobalRegistrator.register();
afterAll(() => GlobalRegistrator.unregister());
mock.module('react-native', () => require('react-native-web'));
mock.module('@/lib/motion', () => ({
  CSS_EASE_OUT: 'cubic-bezier(0.23, 1, 0.32, 1)',
  DURATION: { enter: 160, exit: 120 },
}));
const { fireEvent, render } = await import('@testing-library/react');
const { Tooltip } = await import('./index.web');

function setupPopover(el: HTMLElement, width = 120, height = 28) {
  let open = false;
  const origMatches = el.matches.bind(el);
  el.showPopover = () => {
    open = true;
  };
  el.hidePopover = () => {
    open = false;
  };
  spyOn(el, 'matches').mockImplementation((selector) =>
    selector === ':popover-open' ? open : origMatches(selector),
  );
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height });
  return () => open;
}

test('web tooltip warms only on pointer leave, closes focused popovers on scroll, cleans up on unmount, and clamps wide labels', () => {
  let now = 10_000;
  let nextTimerId = 1;
  const timers = new Map<number, () => void>();
  const clock = spyOn(Date, 'now').mockImplementation(() => now);
  const setTimer = spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
    const id = nextTimerId++;
    timers.set(id, fn);
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  const clearTimer = spyOn(globalThis, 'clearTimeout').mockImplementation(((id: number) => {
    timers.delete(id);
  }) as typeof clearTimeout);

  const view = render(
    <div>
      <Tooltip label="First tip">
        <button type="button">First</button>
      </Tooltip>
      <Tooltip label="Second tip">
        <button type="button">Second</button>
      </Tooltip>
    </div>,
  );
  try {
    const [firstBtn, secondBtn] = view.getAllByRole('button');
    const firstWrap = firstBtn.parentElement!;
    const secondWrap = secondBtn.parentElement!;
    const firstTip = document.getElementById(firstWrap.getAttribute('aria-describedby')!)!;
    const secondTip = document.getElementById(secondWrap.getAttribute('aria-describedby')!)!;
    const isFirstOpen = setupPopover(firstTip, 400, 28);
    const isSecondOpen = setupPopover(secondTip, 100, 28);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });

    // Cold hover waits for delay, then clamps left to >= GAP even for a wide popover.
    fireEvent.pointerEnter(firstWrap, { pointerType: 'mouse' });
    expect(isFirstOpen()).toBe(false);
    for (const fn of timers.values()) fn();
    timers.clear();
    expect(isFirstOpen()).toBe(true);
    expect(firstTip.hasAttribute('data-instant')).toBe(false);
    expect(Number.parseFloat(firstTip.style.left)).toBeGreaterThanOrEqual(6);

    // Scroll hides without warming the second tooltip.
    fireEvent.scroll(window);
    expect(isFirstOpen()).toBe(false);
    now += 50;
    fireEvent.pointerEnter(secondWrap, { pointerType: 'mouse' });
    expect(isSecondOpen()).toBe(false);
    expect(timers.size).toBe(1);

    // Unmounting clears the pending timer and scroll listener.
    for (const fn of timers.values()) fn();
    timers.clear();
    expect(isSecondOpen()).toBe(true);
    // Pointer leave warms the next tooltip within 300ms (and skips animation).
    fireEvent.pointerLeave(secondWrap);
    expect(isSecondOpen()).toBe(false);
    now += 100;
    fireEvent.pointerEnter(firstWrap, { pointerType: 'mouse' });
    expect(isFirstOpen()).toBe(true);
    expect(firstTip.hasAttribute('data-instant')).toBe(true);

    // Escape closes without warming.
    fireEvent.keyDown(firstWrap, { key: 'Escape' });
    expect(isFirstOpen()).toBe(false);
    now += 400;

    // Keyboard focus opens instantly and closes on scroll.
    const origBtnMatches = firstBtn.matches.bind(firstBtn);
    spyOn(firstBtn, 'matches').mockImplementation((sel) =>
      sel === ':focus-visible' ? true : origBtnMatches(sel),
    );
    fireEvent.focus(firstBtn);
    expect(isFirstOpen()).toBe(true);
    expect(firstTip.hasAttribute('data-instant')).toBe(true);
    fireEvent.scroll(window);
    expect(isFirstOpen()).toBe(false);

    // Pending timer is cleared on unmount.
    fireEvent.pointerEnter(secondWrap, { pointerType: 'mouse' });
    expect(timers.size).toBe(1);
    view.unmount();
    expect(timers.size).toBe(0);
  } finally {
    view.unmount();
    clock.mockRestore();
    setTimer.mockRestore();
    clearTimer.mockRestore();
  }
});
