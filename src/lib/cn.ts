/**
 * The app's class-name composer: `clsx` conditionals + `tailwind-merge`
 * conflict resolution in one call, backed by
 * [cnfast](https://github.com/aidenybai/cnfast) (byte-identical output, ~3x
 * faster, zero runtime dependencies).
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
 * implementation — back to clsx + tailwind-merge, or forward to whatever
 * replaces it — is one file, not every call site.
 *
 * cnfast also supports a tagged-template form (``cn`px-2 ${active && 'py-1'}` ``,
 * cached by call-site identity and faster still). Deliberately not used here:
 * one form app-wide keeps the "no backticks in a className" rule mechanical,
 * and a backtick in a className is exactly what invites interpolating
 * something that isn't a class name.
 */
export { cn } from 'cnfast';
export type { ClassValue } from 'cnfast';
