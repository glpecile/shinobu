/**
 * The app's class-name composer: `clsx` conditionals + `tailwind-merge`
 * conflict resolution in one call, backed by
 * [cn](https://github.com/shadcn-ui/cn) (same API and output as
 * clsx + tailwind-merge, zero runtime dependencies, much faster).
 *
 * Every composed `className` goes through this instead of a template literal
 * (`scripts/check-classnames.ts` enforces it). Two reasons, and the second is
 * the one a template literal can't give you:
 *
 * 1. Conditionals stay flat — `cn('border-border', focused && 'border-accent')`
 *    instead of a nested ternary inside `${…}`.
 * 2. **Conflicting utilities resolve last-wins.** A template literal happily
 *    emits `border-border border-accent` and leaves the winner to whichever
 *    layer parses the string; `cn` emits only `border-accent`.
 *
 * Wrapped rather than imported directly (oxlint-enforced) so swapping the
 * implementation is one file, not every call site.
 */
export { cn } from 'cn';
export type { ClassValue } from 'cn';
