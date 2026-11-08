import { beforeEach } from 'bun:test';

// Bun keeps one module registry per process, so without `--isolate` a file
// inherits every earlier file's module mocks and module state (MMKV stores,
// caches) and fails for reasons that aren't its own. `--isolate` loads this
// preload again for each file, so `first` only differs in a shared process.
// docs/solutions/bun-test-mock-module-cross-file-leak.md
let first: string | undefined;
beforeEach(() => {
  first ??= Bun.main;
  if (Bun.main === first) return;
  console.error('\nTest files are sharing one process, so their module mocks and state leak. Run `bun run test` (bun test --isolate).\n');
  process.exit(1);
});
