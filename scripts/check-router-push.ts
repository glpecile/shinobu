// Fails on any bare `router.push(...)`, so navigation goes through
// `usePushRoute()` (@/lib/navigation) and inherits its duplicate-push guard.
//
// Why the guard exists: `components/presstable` debounces each pressable's own
// `onPress`, but that is per-component-instance and the navigation stack is
// global. Two instances of one card (Continue Watching and today's Calendar
// cell render the same show), a sheet action sitting over the card that opened
// it, or a Suspense refetch remounting a row with a fresh ref, all push twice
// without any pressable being pressed twice. `src/lib/navigation/push-guard.ts`
// spells this out.
//
// Why a script and not a lint rule: same reason as `check-classnames.ts` —
// oxlint has no `no-restricted-syntax` and no esquery selector engine, and this
// is a call shape rather than an import. Runs in CI next to `bun lint`
// (.github/workflows/ci.yml) and locally via `bun check:router-push`.
//
// Opting out: put `// push-guard-exempt: <reason>` in the comment block
// immediately above the call — anywhere in it, so the reason can run to as many
// lines as it needs. Reserved for navigation that isn't press-driven — a
// keyboard shortcut, a notification tap — where a repeat is a real second
// intent rather than a stutter.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src';
const EXTENSIONS = ['.ts', '.tsx'];

/** Where `router.push` is the implementation rather than a call site. */
const ALLOWED_DIR = join('src', 'lib', 'navigation');

/** `router.push(`, `router.navigate(` and any aliased router object. */
const ROUTER_PUSH = /\b[A-Za-z_$][\w$]*\.(push|navigate)\s*\(/;

/** Only routers — not `array.push(...)`, which is everywhere. */
const ROUTER_NAME = /\brouter\.(push|navigate)\s*\(/;

const EXEMPT = /\/\/\s*push-guard-exempt:/;
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;

/**
 * Whether the comment block directly above `index` opts this call out. Walks
 * the whole contiguous block rather than only the previous line, so the reason
 * can wrap — a one-line-only check silently stops working the moment someone
 * writes a second sentence.
 */
function exemptedAt(lines: readonly string[], index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = lines[cursor] ?? '';
    if (!COMMENT_LINE.test(line)) return false;
    if (EXEMPT.test(line)) return true;
  }
  return false;
}

interface Violation {
  file: string;
  line: number;
  text: string;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (EXTENSIONS.some((extension) => path.endsWith(extension))) {
      found.push(path);
    }
  }
  return found;
}

function violationsIn(file: string): Violation[] {
  if (file.startsWith(ALLOWED_DIR)) return [];
  const lines = readFileSync(file, 'utf8').split('\n');
  const found: Violation[] = [];
  for (const [index, line] of lines.entries()) {
    if (!ROUTER_NAME.test(line) || !ROUTER_PUSH.test(line)) continue;
    // A `//`-commented line is prose about the rule, not a call.
    if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) {
      continue;
    }
    if (exemptedAt(lines, index)) continue;
    found.push({ file, line: index + 1, text: line.trim() });
  }
  return found;
}

const violations = sourceFiles(ROOT).flatMap(violationsIn);

if (violations.length > 0) {
  console.error(
    `\nUnguarded router.push${violations.length === 1 ? '' : 'es'} found — use usePushRoute() from @/lib/navigation instead:\n`,
  );
  for (const { file, line, text } of violations) {
    console.error(`  ${file}:${line}\n    ${text}`);
  }
  console.error(
    `\n  const router = useRouter();  router.push(routes.details(id));` +
      `\n  → const pushRoute = usePushRoute();  pushRoute(routes.details(id));` +
      `\n\n  Not press-driven? Put \`// push-guard-exempt: <reason>\` above the line.\n`,
  );
  process.exit(1);
}

console.log(`No unguarded router.push in ${ROOT}/.`);
