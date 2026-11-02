# React Compiler silently skips components or drops their memo

## Symptom

A component the profiler labels `[React Compiler]` still re-renders its whole
subtree on unrelated state changes. In the diary, each sticky-header change
while scrolling re-rendered both month calendars (about 150 ms per commit in
dev), even though the inputs hadn't changed.

## What the compiler does

The compiler never errors at build time. It emits the original code instead,
for the whole component or for one memo scope:

- **A `try` without `catch` (or with `finally`)** skips the whole component:
  `(BuildHIR::lowerStatement) Handle TryStatement without a catch clause`.
  Use `await promise.finally(() => …)`.
- **Reading a field of an object that holds a closure over a ref**, e.g.
  `props.today` where `props.onSelect` reads `listRef.current`, is reported as
  "Cannot access refs during render", and the component is skipped. Read the
  plain value from its own variable.
- **A memo scope can't span a hook call.** A value whose inputs were made
  before a hook (a `new Set(…)`, a call result, a closure) and are used after
  it gets no memo. Call every hook first, then derive.
- **Passing a closure into a call** (`flattenDays(…, (entry) => …)`) dropped
  the memo for that call. Pass the data the closure would capture instead.
- **A method call or function call on a derived value**, such as
  `items.find(…)` or `formatDayDate(header.dayKey)` inside JSX, merges it into
  the derivation's scope. The derivation then depends on whatever that call
  depends on (here, scroll state). Move the lookup into a child component that
  receives the value as a prop, which freezes it.
- **`new Date()` in render is memoized** with the scope it lands in and stays
  frozen. Hold `now` as state and wake it with `useWakeAt`
  (`features/up-next/up-next-section.tsx`, `features/diary/diary-list.tsx`).

## How to check a file

```js
// node with NODE_PATH=node_modules; prints CompileError events per function
const babel = require('@babel/core');
const events = [];
babel.transformSync(source, {
  filename, babelrc: false, configFile: false,
  presets: [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
  plugins: [['babel-plugin-react-compiler', { logger: { logEvent: (_, e) => events.push(e) } }]],
});
```

To see whether a value is memoized, compile without the logger and look for
`if ($[n] !== …)` around it. Metro serves the compiled module at
`/src/<path>.bundle?platform=ios&dev=true&transform.reactCompiler=true&modulesOnly=true&runModule=false`.
