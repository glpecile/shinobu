import { beforeEach } from 'bun:test';

// `bun test --isolate` reloads this preload per file, so `Bun.main !== first`
// only in a shared process (docs/solutions/bun-test-mock-module-cross-file-leak.md).
let first: string | undefined;
beforeEach(() => {
  first ??= Bun.main;
  if (Bun.main === first) return;
  console.error(
    '\nTest files are sharing one process, so their module mocks and state leak. Run `bun run test` (bun test --isolate).\n',
  );
  process.exit(1);
});
