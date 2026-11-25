import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

const list = (ids: readonly ProviderId[]) =>
  ids.map((id) => PROVIDERS[id].label).join(', ');

export function chainLabel(
  code: string,
  counts: { landed: number; failed: number; saved?: number },
): string {
  const { landed, failed, saved = 0 } = counts;
  const suffix =
    failed > 0
      ? `${failed} failed`
      : landed > 0
        ? `${landed} logged`
        : saved > 0
          ? `${saved} saved offline`
          : null;
  return suffix == null ? `Log ${code}` : `Log ${code} · ${suffix}`;
}

export function chainFailure(
  codes: readonly string[],
  failed: readonly ProviderId[],
): string {
  const subject =
    codes.length === 1
      ? capitalize(codes[0]!)
      : codes.length === 2
        ? `${capitalize(codes[0]!)} and ${codes[1]}`
        : `${codes.length} episodes`;
  return failed.length > 0
    ? `${subject} failed on ${list(failed)}`
    : `${subject} didn’t log`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
