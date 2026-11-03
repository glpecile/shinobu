import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('provider ids are Provider.* values and types, while tests may spell them', () => {
  const source = `
    declare const Provider: Record<string, string>;
    declare const ProviderIcon: any;
    type ListProvider = typeof Provider.Trakt | 'serializd';
    export const allowed = (id: string) => id === Provider.Trakt || id === 'tmdb';
    export const rejected = (id: string) => {
      if (id === 'trakt') return <ProviderIcon id="anilist" />;
      return ['simkl'];
    };
  `;
  expect(lint('no-provider-literals', { 'feed.tsx': source, 'feed.test.tsx': source })).toHaveLength(4);
});
