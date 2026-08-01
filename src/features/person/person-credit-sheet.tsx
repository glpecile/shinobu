import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { Skeleton } from '@/components/skeleton';
import { PersonLinksSection } from '@/features/provider-links/person-links-section';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useTmdbPersonQuery } from '@/state/queries/tmdb';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedPerson } from '@/types/media';

import { personMetaLine } from './meta-line';
import { PersonAvatar } from './person-avatar';

/** "as Peter Parker / Spider-Man" for cast, the job list for crew. */
export function creditRoleLine(credit: {
  role: string;
  kind: 'cast' | 'crew';
}): string {
  if (credit.role === '') return credit.kind === 'cast' ? 'Cast' : 'Crew';
  return credit.kind === 'cast' ? `as ${credit.role}` : credit.role;
}

/**
 * A credit exactly as the detail screen's Cast/Crew rails hold it — the sheet
 * is opened from a card, so everything the header needs is already in hand and
 * nothing has to load before it can render.
 */
export interface PersonCredit {
  id: string;
  name: string;
  /** Character name(s) for cast, job title(s) for crew; '' when unknown. */
  role: string;
  /** Which rail the card came from — the role's kind, not its text. */
  kind: 'cast' | 'crew';
  headshot: string;
  /** TMDB person id; absent for AniList people (name lookup instead). */
  tmdbId?: number;
}

/**
 * Life dates and birthplace — one line. Non-suspending on purpose: this is a
 * *supplement* to a header that already renders, so it fades in under it rather
 * than holding the whole sheet back. A failure (no token, 404, rate limit)
 * renders nothing at all — the sheet is still useful with just the credit.
 *
 * **No biography** (plan 0035 R6, narrowing plan 0028 R1): five clamped lines of
 * prose pushed the role — the thing the long-press was asking about — off the
 * first screen. Plan 0028's own A1 already said the bio was a supplement rather
 * than the payload; this is that, taken at its word. The full bio still lives on
 * `/person` behind `ExpandableText`, one row away. The person query stays (R7):
 * it feeds this line and warms the route's cache.
 */
function CreditMeta({
  person,
  loading,
}: {
  person: NormalizedPerson | undefined;
  loading: boolean;
}) {
  if (loading) {
    // One line of content now, so one line of skeleton — a three-bar block
    // would reserve space nothing is coming to fill.
    return (
      <View className="mt-5">
        <Skeleton className="h-3 w-2/3 rounded" />
      </View>
    );
  }

  if (person == null) return null;
  // Keys on the meta line alone now that it is the whole content — the old
  // guard also waited on the bio, which would leave an empty 20px gap here.
  const meta = personMetaLine(person);
  if (meta === '') return null;

  return <Text className="text-muted font-sans text-sm mt-5">{meta}</Text>;
}

interface PersonCreditSheetProps {
  /** Kept (not nulled) while closing so content doesn't vanish mid-animation. */
  credit: PersonCredit | null;
  open: boolean;
  onClose: () => void;
}

/**
 * The long-press dialog behind a Cast/Crew card (plan 0028 R1).
 *
 * A credit card is 96px wide and clamps its role to two lines, so "Additional
 * Voices / Villager #3" and a six-job crew credit ("Executive Producer,
 * Producer, Unit Production Manager") both die in an ellipsis — and tapping the
 * card navigates away rather than telling you what it said. Long-press answers
 * the question in place: the full role text, who the person is, and the same
 * "View on" links the person page carries, with navigation still one row away.
 *
 * The meta line needs a TMDB person id and a token; without either the sheet is
 * just the credit — which is the part the long-press was asking about anyway.
 */
export function PersonCreditSheet({
  credit,
  open,
  onClose,
}: PersonCreditSheetProps) {
  const pushRoute = usePushRoute();
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  // No TMDB token, no person pages and no bio — same gate the cards use.
  const hasTmdb = useTmdbToken() !== '';
  // Fetched only while the sheet is open, and keyed the same as the person
  // route's query, so opening this warms that page and vice versa.
  const personQuery = useTmdbPersonQuery({
    tmdbId: credit?.tmdbId,
    enabled: open && hasTmdb,
  });
  const person = personQuery.data?.person;

  return (
    <Sheet onClose={onClose} open={open && credit != null}>
      {credit != null && (
        <>
          {/* Same header shape as the card-actions sheet — image, title, one
              muted line under it — so the two long-press dialogs read as one
              control. The role sits in that line rather than a paragraph below
              a red CAST chip: it is the answer the long-press asked for, and
              it wraps here instead of clamping (the card's ellipsis is the
              whole reason this sheet exists). */}
          <View className="flex-row items-center gap-4">
            <PersonAvatar
              className="w-20 h-20"
              headshot={credit.headshot}
              name={credit.name}
              textClassName="text-xl"
            />
            <View className="flex-1">
              <Text className="text-2xl font-display text-foreground">
                {credit.name}
              </Text>
              <Text className="text-muted font-sans text-sm mt-1">
                {creditRoleLine(credit)}
              </Text>
            </View>
          </View>

          <CreditMeta
            loading={credit.tmdbId != null && hasTmdb && personQuery.isPending}
            person={person}
          />

          {hasTmdb && (
            <PresstableOpacity
              accessibilityRole="button"
              className="flex-row items-center gap-3 rounded px-5 py-3 mt-5 border border-border"
              onPress={() => {
                onClose();
                pushRoute(
                  credit.tmdbId != null
                    ? routes.person(credit.tmdbId)
                    : routes.personLookup(credit.name),
                );
              }}
            >
              <Ionicons color={mutedColor} name="person-outline" size={18} />
              <Text className="text-foreground font-sans-semibold text-base">
                View filmography
              </Text>
            </PresstableOpacity>
          )}

          {/* The person-page "View on" links as sheet rows — a person has no
              source provider, so these gate purely on what's connected.
              Letterboxd files people by craft, so the department matters: TMDB's
              is used once it arrives, and until then a cast credit is Acting by
              definition (a crew one just takes the builder's own default). */}
          <PersonLinksSection
            enabled={open}
            onOpened={onClose}
            person={{
              name: credit.name,
              ...(person?.knownForDepartment != null
                ? { knownForDepartment: person.knownForDepartment }
                : credit.kind === 'cast'
                  ? { knownForDepartment: 'Acting' }
                  : {}),
            }}
            variant="rows"
          />
        </>
      )}
    </Sheet>
  );
}
