import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Diagnostic {
  code: string;
  message: string;
  filename: string;
}

/** Run the real plugin with only the rule under test enabled. */
export function lint(rule: string, files: Record<string, string>): Diagnostic[] {
  const dir = mkdtempSync(join(tmpdir(), 'shinobu-lint-'));
  try {
    const config = join(dir, '.oxlintrc.json');
    writeFileSync(config, JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [fileURLToPath(new URL('../index.ts', import.meta.url))],
      rules: { [`shinobu/${rule}`]: 'error' },
    }));
    const paths = Object.entries(files).map(([file, source]) => {
      const path = join(dir, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, source);
      return path;
    });
    const result = Bun.spawnSync(['bun', 'x', '--no-install', 'oxlint', '--config', config, '--format', 'json', ...paths]);
    if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error(result.stderr.toString());
    const diagnostics: Diagnostic[] = JSON.parse(result.stdout.toString()).diagnostics;
    if (diagnostics.some((diagnostic) => diagnostic.code !== `shinobu(${rule})`)) {
      throw new Error(JSON.stringify(diagnostics));
    }
    if (result.exitCode !== (diagnostics.length > 0 ? 1 : 0)) throw new Error(result.stderr.toString());
    return diagnostics;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
