import { describe, expect, test } from 'bun:test';

import { bumpVersion } from './bump-version';

describe('bumpVersion', () => {
  test('patch bump increments patch and versionCode', () => {
    const next = bumpVersion({ version: '0.1.0', versionCode: 1 }, 'patch');
    expect(next).toEqual({ version: '0.1.1', versionCode: 2 });
  });

  test('minor bump resets patch to 0', () => {
    const next = bumpVersion({ version: '0.1.5', versionCode: 3 }, 'minor');
    expect(next).toEqual({ version: '0.2.0', versionCode: 4 });
  });

  test('major bump resets minor and patch to 0', () => {
    const next = bumpVersion({ version: '0.1.5', versionCode: 3 }, 'major');
    expect(next).toEqual({ version: '1.0.0', versionCode: 4 });
  });

  test('explicit version sets version and increments versionCode', () => {
    const next = bumpVersion({ version: '0.1.0', versionCode: 1 }, '1.0.0');
    expect(next).toEqual({ version: '1.0.0', versionCode: 2 });
  });

  test('invalid input throws and callers can leave the file untouched', () => {
    expect(() => bumpVersion({ version: '0.1.0', versionCode: 1 }, 'nonsense')).toThrow();
    expect(() => bumpVersion({ version: '0.1.0', versionCode: 1 }, '1.0')).toThrow();
  });

  test('downgrade attempt is refused', () => {
    expect(() => bumpVersion({ version: '0.1.0', versionCode: 1 }, '0.0.9')).toThrow();
  });

  test('same-version "bump" is refused (no-op is not an increase)', () => {
    expect(() => bumpVersion({ version: '0.1.0', versionCode: 1 }, '0.1.0')).toThrow();
  });
});
