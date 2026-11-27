import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { THEME_COLOR_TOKENS } from './tokens';

const names = (block: string) =>
  [...block.matchAll(/(--color-[a-z-]+):/g)].map((m) => m[1]);

test('the typed tokens are the ones global.css declares in both themes', () => {
  const css = readFileSync(new URL('../../global.css', import.meta.url), 'utf8');
  const [light, dark] = css.split('@variant dark');
  expect(names(dark)).toEqual([...THEME_COLOR_TOKENS]);
  expect([...names(light)].sort()).toEqual([...THEME_COLOR_TOKENS].sort());
});
