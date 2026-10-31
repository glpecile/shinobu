import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { expect, mock, spyOn, test } from 'bun:test';
import { useLayoutEffect, type ReactNode } from 'react';

GlobalRegistrator.register();
const { act, render } = await import('@testing-library/react');

mock.module('react-native', () => ({ View: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
mock.module('@/components/animated-view', () => ({
  AnimatedView: ({ children, onCSSAnimationStart, ...props }: {
    children?: ReactNode;
    onCSSAnimationStart?: () => void;
  }) => {
    useLayoutEffect(() => { onCSSAnimationStart?.(); }, []);
    return <div aria-hidden={(props as { 'aria-hidden'?: boolean })['aria-hidden']}>{children}</div>;
  },
}));
mock.module('@/components/section-enter', () => ({
  SectionEnter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  heldKeyframes: () => ({}),
  sectionFading: {},
}));
mock.module('@/lib/motion', () => ({ DURATION: { swap: 180 }, EASE_OUT: 'ease-out' }));
mock.module('@/lib/toast', () => ({ toast: { error: mock(() => {}) } }));
const { SuspenseSection } = await import('./suspense-section');

// The fallback is a real provider link, so it cannot be duplicated on reveal.
test('interactive fallbacks leave no hidden focus target when content resolves', async () => {
  let resolve!: () => void;
  const pending = new Promise<void>((done) => { resolve = done; });
  let ready = false;
  function Content() {
    if (!ready) throw pending;
    return <span>Score loaded</span>;
  }
  let now = 0;
  const clock = spyOn(performance, 'now').mockImplementation(() => now);
  const view = render(
    <SuspenseSection animateFallback={false} fallback={<a href="https://example.com">Provider link</a>}>
      <Content />
    </SuspenseSection>,
  );
  try {
    view.getByRole('link').focus();
    expect(document.activeElement).toBe(view.getByRole('link'));
    now = 1000;
    await act(async () => { ready = true; resolve(); await pending; });
    await view.findByText('Score loaded');
    expect(view.container.querySelectorAll('a').length).toBe(0);
  } finally {
    view.unmount();
    clock.mockRestore();
  }
});
