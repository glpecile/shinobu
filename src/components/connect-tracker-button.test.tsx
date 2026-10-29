import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { expect, mock, test } from 'bun:test';

GlobalRegistrator.register();
const { fireEvent, render } = await import('@testing-library/react');
let focused = true;
let accepted = false;
mock.module('expo-router', () => ({ useIsFocused: () => focused }));
mock.module('@/lib/navigation', () => ({ usePushRoute: () => () => accepted }));
mock.module('@/components/button', () => ({
  Button: Object.assign(
    ({ label, loading, onPress }: { label: string; loading: boolean; onPress: () => void }) =>
      <button aria-busy={loading} disabled={loading} onClick={onPress}>{label}</button>,
    { Icon: () => null },
  ),
}));
const { ConnectTrackerButton } = await import('./connect-tracker-button');

test('connect feedback follows accepted navigation and clears after leaving the tab', () => {
  const view = render(<ConnectTrackerButton />);
  try {
    const button = view.getByRole('button');
    fireEvent.click(button);
    expect(button.getAttribute('aria-busy')).toBe('false');
    accepted = true;
    fireEvent.click(button);
    expect(button.getAttribute('aria-busy')).toBe('true');
    focused = false;
    view.rerender(<ConnectTrackerButton />);
    focused = true;
    view.rerender(<ConnectTrackerButton />);
    expect(button.getAttribute('aria-busy')).toBe('false');
  } finally {
    view.unmount();
  }
});
