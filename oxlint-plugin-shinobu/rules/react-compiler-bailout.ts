import { transformSync } from '@babel/core';
import { defineRule, type ESTree } from '@oxlint/plugins';
import reactCompiler from 'babel-plugin-react-compiler';

interface Location {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

interface CompilerEvent {
  kind: string;
  fnName?: string | null;
  fnLoc?: { start: { index: number }; end: { index: number } } | null;
  detail?: {
    reason?: string;
    loc?: Location | symbol | null;
    options?: {
      reason?: string;
      loc?: Location | symbol | null;
      details?: Array<{ loc?: Location | symbol | null; message?: string | null }>;
    };
  };
}

function isLocation(value: unknown): value is Location {
  return typeof value === 'object' && value != null && 'start' in value;
}

// The compiler only touches components (JSX) and hooks (`useX`), and tests
// never ship, so the rest of the files skip the parse.
const COMPILABLE = /\.tsx$|(?:function|const|let)\s+use[A-Z]/;
const OPT_OUT = new Set(['use no memo', 'use no forget']);

function optsOut(body: readonly ESTree.Node[] | undefined): boolean {
  const first = body?.[0];
  return first != null && 'directive' in first && OPT_OUT.has(first.directive ?? '');
}

/**
 * Runs the app's own React Compiler (the options `babel-preset-expo` passes)
 * over the file and reports every function it refuses. The build never fails
 * on these: it ships the uncompiled function, so the component re-renders its
 * whole subtree. `'use no memo'` is the deliberate opt-out and isn't reported.
 * docs/solutions/react-compiler-silent-bailouts.md
 */
export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Every component and hook must compile under React Compiler.' },
    schema: [],
  },
  create(context) {
    // The compiler logs a function's error before it reads that function's
    // opt-out directive, so the opted-out ranges come from the AST.
    const optedOut: Array<readonly [number, number]> = [];
    function noteOptOut(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
      if (node.body?.type === 'BlockStatement' && optsOut(node.body.body)) optedOut.push(node.range);
    }
    return {
      FunctionDeclaration: noteOptOut,
      FunctionExpression: noteOptOut,
      ArrowFunctionExpression: noteOptOut,
      'Program:exit'(program) {
        const source = context.sourceCode.text;
        if (/\.test\.tsx?$/.test(context.filename)) return;
        if (!COMPILABLE.test(context.filename) && !COMPILABLE.test(source)) return;
        if (optsOut(program.body)) return;
        const events: CompilerEvent[] = [];
        try {
          transformSync(source, {
            filename: context.filename,
            babelrc: false,
            configFile: false,
            code: false,
            parserOpts: { plugins: ['jsx', 'typescript'] },
            plugins: [[reactCompiler, { target: '19', logger: { logEvent: (_: string, event: CompilerEvent) => events.push(event) } }]],
          });
        } catch {
          return;
        }
        for (const event of events) {
          if (event.kind !== 'CompileError' && event.kind !== 'PipelineError') continue;
          const at = event.fnLoc?.start.index;
          if (at != null && optedOut.some(([start, end]) => at >= start && at < end)) continue;
          const detail = event.detail ?? {};
          const reason = detail.options?.reason ?? detail.reason ?? event.kind;
          const located = (detail.options?.details ?? []).filter((item) => isLocation(item.loc));
          const sites = located.length > 0
            ? located.map((item) => ({ loc: item.loc as Location, why: item.message ?? '' }))
            : [{ loc: [detail.options?.loc, detail.loc].find(isLocation), why: '' }];
          for (const { loc, why } of sites) {
            context.report({
              ...(loc == null ? { node: program } : { loc }),
              message: `React Compiler skips ${event.fnName ?? 'this function'}: ${reason}${why === '' ? '' : ` (${why})`}. It ships uncompiled and re-renders its whole subtree.`,
            });
          }
        }
      },
    };
  },
});
