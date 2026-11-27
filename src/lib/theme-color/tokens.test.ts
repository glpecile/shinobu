import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { THEME_COLOR_TOKENS } from './tokens';

const names = (block: string) =>
  [...block.replaceAll(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--color-[a-z0-9-]+):/g)].map(
    (m) => m[1],
  );

test('the typed tokens are the ones global.css declares in both themes', () => {
  const css = readFileSync(new URL('../../global.css', import.meta.url), 'utf8');
  const [light, dark] = css.split('@variant dark');
  expect(names(dark)).toEqual([...THEME_COLOR_TOKENS]);
  expect([...names(light)].sort()).toEqual([...THEME_COLOR_TOKENS].sort());
});

test('DESIGN.md gives every token a role', () => {
  const design = readFileSync(new URL('../../../DESIGN.md', import.meta.url), 'utf8');
  expect([...new Set(design.match(/--color-[a-z0-9-]+/g))].sort()).toEqual(
    [...THEME_COLOR_TOKENS].sort(),
  );
});
