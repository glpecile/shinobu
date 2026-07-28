import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { openExternalUrl } from '@/lib/open-external-url';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

/**
 * What the row is *for*, which decides how loud it is.
 *
 * - `accent` — something went wrong and this is the recourse. It sits under a
 *   "Failed on …" line and should carry that line's urgency.
 * - `neutral` — nothing went wrong. This is an alternative route offered up
 *   front (Letterboxd on web can't be written to, so here is the page) or the
 *   footnote to a reasoned skip. Plan 0022 U4 specified exactly this —
 *   "muted styling (not accent) so it reads as informational" — and it shipped
 *   accent, so an unremarkable "Add on Serializd" was drawn in the same alarm
 *   red as a genuine write failure.
 */
export type OutcomeLinkTone = 'accent' | 'neutral';

const TONE: Record<OutcomeLinkTone, { token: string; label: string }> = {
  accent: { token: '--color-accent', label: 'text-accent' },
  neutral: { token: '--color-foreground', label: 'text-foreground' },
};

/**
 * The "{verb} {Provider}" external-link row shared by every fail-case surface
 * (plan 0022 R5/R6). `verb` defaults to the log path's wording so existing call
 * sites are unchanged; the watchlist verbs pass their own (plan 0031 U1).
 *
 * It resolves its own colour from `tone` rather than taking one: every call
 * site used to run the same `useCSSVariable('--color-accent')` dance and drill
 * the result down, which is four copies of one decision and four chances for
 * the icon to stop matching the text beside it.
 */
export function OutcomeLink({
  provider,
  url,
  tone = 'accent',
  verb = 'Log on',
}: {
  provider: ProviderId;
  url: string;
  tone?: OutcomeLinkTone;
  verb?: string;
}) {
  const color = useCSSVariable(TONE[tone].token);

  return (
    <PresstableOpacity onPress={() => openExternalUrl(url)}>
      <View className="flex-row items-center gap-1 mt-0.5">
        <Ionicons
          color={typeof color === 'string' ? color : undefined}
          name="open-outline"
          size={14}
        />
        <Text className={cn('font-sans text-xs', TONE[tone].label)}>
          {verb} {PROVIDERS[provider].label}
        </Text>
      </View>
    </PresstableOpacity>
  );
}
