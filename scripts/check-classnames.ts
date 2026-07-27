// Fails on any `className` built with a template literal, so composed class
// names go through `cn()` (@/lib/cn) instead.
//
// Why a script and not a lint rule: this is exactly what ESLint's
// `no-restricted-syntax` is for, but oxlint doesn't implement it ("Rule
// 'no-restricted-syntax' not found in plugin 'eslint'", oxlint 1.73) — it has
// no esquery selector engine. Rather than leave the convention to review, or
// pull ESLint back in for one rule, the check lives here and runs in CI next
// to `bun lint` (.github/workflows/ci.yml) and locally via
// `bun check:classnames`.
//
// What's wrong with `className={`px-4 ${MAYBE}`}`:
//   1. Conditionals nest into ternaries inside `${…}` and stop being readable.
//   2. Conflicting utilities both survive — `border-border border-accent` ships
//      two border colors and leaves the winner to whichever layer parses the
//      string last. `cn` resolves that to one, deterministically.
//
// The match is deliberately crude — a backtick immediately after `className={`
// — because that's precisely the shape being banned, whether it spans one line
// or ten. Interpolation-free literals (`className="px-4"`) are untouched, and
// so is every other template literal in the file.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src';
const EXTENSIONS = ['.tsx', '.jsx'];

/** Matches `className={`` `, `contentContainerClassName={`` `, and friends. */
const TEMPLATE_CLASSNAME = /\b[A-Za-z]*[Cc]lassName=\{`/g;

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
  const lines = readFileSync(file, 'utf8').split('\n');
  const found: Violation[] = [];
  for (const [index, line] of lines.entries()) {
    // Reset between lines — the regex is global and stateful.
    TEMPLATE_CLASSNAME.lastIndex = 0;
    if (TEMPLATE_CLASSNAME.test(line)) {
      found.push({ file, line: index + 1, text: line.trim() });
    }
  }
  return found;
}

const violations = sourceFiles(ROOT).flatMap(violationsIn);

if (violations.length > 0) {
  console.error(
    `\nTemplate-literal className${violations.length === 1 ? '' : 's'} found — use cn() from @/lib/cn instead:\n`,
  );
  for (const { file, line, text } of violations) {
    console.error(`  ${file}:${line}\n    ${text}`);
  }
  console.error(
    `\n  className={\`px-4 \${active ? 'bg-accent' : ''}\`}` +
      `\n  → className={cn('px-4', active && 'bg-accent')}\n`,
  );
  process.exit(1);
}

console.log(`No template-literal classNames in ${ROOT}/.`);
