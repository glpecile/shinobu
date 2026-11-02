import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('a component React Compiler skips is reported, and the opt-out directive is not', () => {
  expect(lint('react-compiler-bailout', {
    'skipped.tsx': `export function Skipped({ load }: { load: () => Promise<void> }) {
  async function refresh() {
    try { await load(); } finally { console.log('done'); }
  }
  return <button onClick={refresh} />;
}`,
    'compiled.tsx': `export function Compiled({ load }: { load: () => Promise<void> }) {
  async function refresh() {
    await load().finally(() => console.log('done'));
  }
  return <button onClick={refresh} />;
}`,
    'opted-out.tsx': `export function OptedOut({ load }: { load: () => Promise<void> }) {
  // Why it opts out.
  'use no memo';
  async function refresh() {
    try { await load(); } finally { console.log('done'); }
  }
  return <button onClick={refresh} />;
}`,
  }).map((diagnostic) => diagnostic.filename)).toEqual([expect.stringMatching(/skipped\.tsx$/)]);
});
