import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, expect, mock, test } from 'bun:test';
import { useState, type ReactNode } from 'react';

import type { NormalizedMediaItem } from '@/types/media';

GlobalRegistrator.register();
afterAll(() => GlobalRegistrator.unregister());
const { fireEvent, render } = await import('@testing-library/react');

const show = { id: 'anilist-154587', title: 'Frieren', type: 'ANIME', coverImage: '', currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { anilist: 154587 } } satisfies NormalizedMediaItem;
let resolved: { item: NormalizedMediaItem | undefined; isLoading: boolean } = { item: undefined, isLoading: true };
mock.module('expo-router', () => ({ useLocalSearchParams: () => ({ provider: 'serializd', item: show.id, type: show.type }) }));
mock.module('react-native', () => ({ View: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
mock.module('@/components/skeleton', () => ({ Skeleton: () => <div /> }));
mock.module('@/features/lists/list-header', () => ({ ListsHeader: () => <h1>New list</h1> }));
mock.module('@/state/queries/resolve-item', () => ({ useResolvedMediaItem: () => resolved }));
mock.module('@/state/session', () => ({ useConnectedProviders: () => ['serializd'] }));
mock.module('@/state/session/letterboxd', () => ({ getLetterboxdUsername: () => null }));
mock.module('@/state/session/serializd', () => ({ getSerializdUsername: () => 'viewer' }));
function Editor({ initialItems = [] }: { initialItems?: NormalizedMediaItem[] }) {
  const [name, setName] = useState('');
  const [items] = useState(initialItems);
  return <><input aria-label="Name" onChange={(event) => setName(event.target.value)} value={name} /><span>{items[0]?.title}</span></>;
}
mock.module('@/features/lists/new-list-form', () => ({ NewListScreen: Editor }));

const { default: NewListRoute } = await import('@/app/lists/new');

test('waits for the starting title before accepting edits, then keeps the draft through refetch', () => {
  const view = render(<NewListRoute />);
  try {
    expect(view.queryByRole('textbox', { name: 'Name' })).toBeNull();
    resolved = { item: show, isLoading: false };
    view.rerender(<NewListRoute />);
    expect(view.getByText('Frieren')).toBeDefined();
    fireEvent.change(view.getByRole('textbox', { name: 'Name' }), { target: { value: 'My favourites' } });
    resolved = { item: { ...show, title: 'Frieren: Beyond Journey’s End' }, isLoading: true };
    view.rerender(<NewListRoute />);
    expect((view.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('My favourites');
  } finally {
    view.unmount();
  }
});
