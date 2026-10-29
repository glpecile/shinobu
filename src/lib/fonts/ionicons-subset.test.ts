import { expect, test } from 'bun:test';
import { Glob } from 'bun';

import glyphmap from '@react-native-vector-icons/ionicons/glyphmaps/Ionicons.json';

import subset from './ionicons-subset.json';

test('the web Ionicons subset covers every icon name in src (rerun `uv run scripts/subset-fonts.py`)', async () => {
  const used = new Set<string>();
  for await (const path of new Glob('src/**/*.{ts,tsx}').scan()) {
    if (path.includes('.test.')) continue;
    for (const [, name] of (await Bun.file(path).text()).matchAll(/['"]([a-z0-9-]+)['"]/g)) {
      if (name in glyphmap) used.add(name);
    }
  }
  expect([...used].filter((name) => !subset.includes(name))).toEqual([]);
});
