import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ComponentProps } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { Eyebrow } from '@/components/eyebrow';
import { PresstableOpacity } from '@/components/presstable';
import { Skeleton } from '@/components/skeleton';
import { Tooltip } from '@/components/tooltip';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format-count';
import { useThemeColor } from '@/lib/theme-color';

import type { DaySummary } from './merge';

/**
 * A month's calendar heading that month in the diary, drawn from the days the
 * feed has already merged — it never fetches. `activity` maps a local day key
 * to that day's summary (`summarizeDay`), and `oldest` is the oldest loaded day:
 * anything before it is unknown rather than empty, so it stays unshaded and
 * fills in as infinite scroll loads further back. A month only appears once
 * one of its days has loaded, so the gap is at most the tail of the oldest one.
 */
export interface DiaryMonthProps {
  /** `YYYY-MM`. */
  month: string;
  activity: ReadonlyMap<string, DaySummary>;
  /** Empty once the feed has no older page, so every day is known. */
  oldest: string;
  today: string;
  /** Stack stats vertically for a side column with height to spare. */
  stacked?: boolean;
  /** Pressing a day with logs; the list scrolls to it. */
  onSelectDay?: (dayKey: string) => void;
}

const DAY_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const DAY_DATE_YEAR = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Today", "Tue, Oct 14", or "Mon, Jul 14, 2025" for another year. */
export function formatDayDate(dayKey: string, today: string): string {
  if (dayKey === today) return 'Today';
  // The key is already the local day; formatting it as UTC midnight keeps it.
  const date = new Date(`${dayKey}T00:00:00Z`);
  return (dayKey.startsWith(today.slice(0, 4)) ? DAY_DATE : DAY_DATE_YEAR).format(date);
}

/** `YYYY-MM-DD` keys are calendar days, so UTC arithmetic steps them DST-free. */
function keyDate(key: string): Date {
  const [year, month, day = 1] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function previousDay(key: string): string {
  const date = keyDate(key);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

const LEVELS = ['bg-border/50', 'bg-accent/25', 'bg-accent/50', 'bg-accent/75', 'bg-accent'];

/** Fixed thresholds, so a day keeps its shade as older pages load. */
function level(units: number): number {
  if (units <= 0) return 0;
  if (units === 1) return 1;
  if (units <= 3) return 2;
  if (units <= 6) return 3;
  return 4;
}

/** What hovering a day says: its date, then what was logged or why it's blank. */
function dayTooltip(key: string, units: number | null, props: DiaryMonthProps): string {
  const date = formatDayDate(key, props.today);
  if (units == null) return `${date} · not loaded yet`;
  return `${date} · ${props.activity.get(key)?.label || 'nothing logged'}`;
}

/** A day's units, or null when it is in the future or not loaded yet. */
function dayUnits(key: string, props: DiaryMonthProps): number | null {
  if (key > props.today || key < props.oldest) return null;
  return props.activity.get(key)?.units ?? 0;
}

/** The month's logged units, its active days, and its longest run of them (first and last day). */
function monthStats(keys: readonly string[], props: DiaryMonthProps) {
  let units = 0;
  let days = 0;
  let longest = { length: 0, from: '', to: '' };
  let run = 0;
  for (const [index, key] of keys.entries()) {
    const value = dayUnits(key, props) ?? 0;
    run = value > 0 ? run + 1 : 0;
    if (run > longest.length) longest = { length: run, from: keys[index - run + 1], to: key };
    if (value > 0) days++;
    units += value;
  }
  return { units, days, longest };
}

/**
 * The run of active days ending today, or yesterday while today is still
 * unlogged. It crosses month boundaries, so it walks the whole loaded map;
 * `partial` when the run reaches the oldest loaded day and may go further.
 */
function currentStreak(props: DiaryMonthProps) {
  let key = (props.activity.get(props.today)?.units ?? 0) > 0 ? props.today : previousDay(props.today);
  let streak = 0;
  let since = '';
  while (key >= props.oldest && (props.activity.get(key)?.units ?? 0) > 0) {
    streak++;
    since = key;
    key = previousDay(key);
  }
  return { streak, since, partial: key < props.oldest };
}

function Stat({
  icon,
  accent = false,
  value,
  atLeast = false,
  label,
  tooltip,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  accent?: boolean;
  /** A lower bound: older pages that could raise it haven't loaded. */
  atLeast?: boolean;
  /** Null while loading: the bar stands in for the number alone. */
  value: number | null;
  label: string;
  /** Web hover: the context behind the number. */
  tooltip: string;
}) {
  const color = useThemeColor(accent && value != null && value > 0 ? '--color-accent' : '--color-muted');
  const stat = (
    <View accessible accessibilityLabel={value == null ? label : `${atLeast ? 'at least ' : ''}${value} ${label}`} className="flex-row items-center gap-2">
      <Ionicons color={color} name={icon} size={18} />
      <View className="shrink">
        {value == null ? (
          <Skeleton className="h-5 w-8 rounded my-0.5" />
        ) : (
          <Text className="text-foreground font-sans-semibold text-base">{formatCount(value)}{atLeast && '+'}</Text>
        )}
        <Text className="text-muted font-sans text-[11px]" numberOfLines={2}>{label}</Text>
      </View>
    </View>
  );
  return value == null ? stat : <Tooltip label={tooltip}>{stat}</Tooltip>;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** The month's day keys, and the same keys as Monday-first weeks padded with nulls. */
function monthGrid(month: string) {
  const first = keyDate(month);
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const keys = Array.from({ length }, (_, day) => `${month}-${`${day + 1}`.padStart(2, '0')}`);
  const cells: Array<string | null> = [
    // getUTCDay counts from Sunday; shift so Monday is column 0.
    ...Array.from({ length: (first.getUTCDay() + 6) % 7 }, () => null),
    ...keys,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
  return { keys, weeks };
}

const CELL = 'flex-1 min-h-11 aspect-square rounded-md';

/**
 * With `loading`, everything that doesn't come from the feed — the title,
 * weekdays, day numerals, and stat labels — renders as itself, and only the
 * past days' shading and the stat numbers pulse.
 */
export function DiaryMonth({ loading = false, ...props }: DiaryMonthProps & { loading?: boolean }) {
  const stacked = props.stacked === true;
  // Seven 44px targets and six 4px gaps need 332px before the page gutters.
  const tight = useWindowDimensions().width < 380;
  const first = keyDate(props.month);
  const year = first.getUTCFullYear();
  const { keys, weeks } = monthGrid(props.month);
  const stats = monthStats(keys, props);
  const streak = currentStreak(props);
  const date = (key: string) => formatDayDate(key, props.today);
  const { longest } = stats;
  const partial = !loading && keys[0] < props.oldest;
  const isCurrent = props.today.startsWith(props.month);
  const name = MONTH_NAMES[first.getUTCMonth()];
  const title = props.today.startsWith(`${year}`) ? name : `${name} ${year}`;

  return (
    <View className={cn('pt-6 pb-2', tight ? 'px-0' : 'px-6')}>
      <Eyebrow className={cn('mb-3', tight && 'mx-6')}>{title}</Eyebrow>
      <View className="gap-5">
        <View
          // Capped so a wide web window gets a calendar, not a row of pills.
          className={cn('w-full max-w-96', !tight && 'gap-1')}
        >
          <View className={cn('flex-row', !tight && 'gap-1')}>
            {WEEKDAY_INITIALS.map((initial, index) => (
              <Text className="flex-1 text-center text-muted font-sans text-[10px] leading-3" key={index}>
                {initial}
              </Text>
            ))}
          </View>
          {weeks.map((week, row) => (
            <View className={cn('flex-row', !tight && 'gap-1')} key={row}>
              {week.map((key, column) => {
                if (key == null) return <View className={CELL} key={column} />;
                const future = key > props.today;
                const units = loading ? null : dayUnits(key, props);
                const shade = units == null ? null : level(units);
                const cell = (
                  <View
                    className={cn(
                      'flex-1 rounded-md items-center justify-center',
                      shade != null && LEVELS[shade],
                      key === props.today && 'border border-accent',
                    )}
                  >
                    {loading && !future && <Skeleton className="absolute inset-0 rounded-md" />}
                    <Text
                      className={cn(
                        'font-sans text-[11px]',
                        shade === 4 ? 'text-accent-foreground'
                          : shade === 3 ? 'text-foreground dark:text-accent-foreground'
                          : shade != null && shade > 0 ? 'text-foreground' : 'text-muted',
                        units == null && !loading && 'opacity-40',
                      )}
                    >
                      {Number(key.slice(8))}
                    </Text>
                  </View>
                );
                if (future || loading) return <View className={CELL} key={key}>{cell}</View>;
                const label = dayTooltip(key, units, props);
                const onSelectDay = props.onSelectDay;
                return (
                  <View className={CELL} key={key}>
                    <Tooltip fill label={label}>
                      {units != null && units > 0 && onSelectDay != null ? (
                        <PresstableOpacity
                          accessibilityLabel={label}
                          accessibilityRole="button"
                          className="flex-1"
                          onPress={() => onSelectDay(key)}
                        >
                          {cell}
                        </PresstableOpacity>
                      ) : (
                        <View accessible accessibilityLabel={label} className="flex-1">{cell}</View>
                      )}
                    </Tooltip>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <View className={cn(stacked ? 'gap-4' : 'flex-row flex-wrap gap-5', tight && 'px-6')}>
          {isCurrent && (
            <Stat
              accent
              atLeast={!loading && streak.partial}
              icon="flame"
              label="day streak"
              tooltip={streak.streak > 0 ? `Since ${date(streak.since)}` : 'Log something today to start one'}
              value={loading ? null : streak.streak}
            />
          )}
          <Stat
            atLeast={partial}
            icon="trophy"
            label="longest streak"
            tooltip={
              longest.length === 0 ? `Nothing logged in ${name}`
              : longest.length === 1 ? date(longest.from)
              : `${date(longest.from)} – ${date(longest.to)}`
            }
            value={loading ? null : longest.length}
          />
          <Stat
            atLeast={partial}
            icon="play-circle"
            label={`logged in ${name}`}
            tooltip={`Across ${stats.days} ${stats.days === 1 ? 'day' : 'days'}`}
            value={loading ? null : stats.units}
          />
        </View>
      </View>
    </View>
  );
}

const NO_ACTIVITY: ReadonlyMap<string, DaySummary> = new Map();

/** The current month as `DiaryMonth` draws it while the feed loads. */
export function DiaryMonthSkeleton({ stacked = false }: { stacked?: boolean }) {
  const now = new Date();
  const today = [
    now.getFullYear(),
    `${now.getMonth() + 1}`.padStart(2, '0'),
    `${now.getDate()}`.padStart(2, '0'),
  ].join('-');
  return (
    <DiaryMonth
      activity={NO_ACTIVITY}
      loading
      month={today.slice(0, 7)}
      oldest={today}
      stacked={stacked}
      today={today}
    />
  );
}
