import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';
import type { CSSTransitionProperties } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Button } from '@/components/button';
import { Collapse } from '@/components/collapse';
import { Eyebrow } from '@/components/eyebrow';
import { MorphText } from '@/components/morph-text';
import { PresstableOpacity } from '@/components/presstable';
import { Skeleton } from '@/components/skeleton';
import { Tooltip } from '@/components/tooltip';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format-count';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

import type { DaySummary } from './merge';

export interface DiaryMonthProps {
  /** `YYYY-MM`. */
  month: string;
  activity: ReadonlyMap<string, DaySummary>;
  /** Empty once the feed has no older page, so every day is known. */
  oldest: string;
  today: string;
  reading?: { chapters: boolean; books: boolean };
  stacked?: boolean;
  onSelectDay?: (dayKey: string) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
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

function level(units: number): number {
  if (units <= 0) return 0;
  if (units === 1) return 1;
  if (units <= 3) return 2;
  if (units <= 6) return 3;
  return 4;
}

function dayTooltip(key: string, units: number | null, props: DiaryMonthProps): string {
  const date = formatDayDate(key, props.today);
  if (units == null) return `${date} · not loaded yet`;
  return `${date} · ${props.activity.get(key)?.label || 'nothing logged'}`;
}

function dayUnits(key: string, props: DiaryMonthProps): number | null {
  if (key > props.today || key < props.oldest) return null;
  return props.activity.get(key)?.units ?? 0;
}

function monthStats(keys: readonly string[], props: DiaryMonthProps) {
  let units = 0;
  let chapters = 0;
  let chapterDays = 0;
  const books = new Set<string>();
  let bookDays = 0;
  let days = 0;
  let longest = { length: 0, from: '', to: '' };
  let run = 0;
  for (const [index, key] of keys.entries()) {
    const known = dayUnits(key, props);
    const value = known ?? 0;
    run = value > 0 ? run + 1 : 0;
    if (run > longest.length) longest = { length: run, from: keys[index - run + 1], to: key };
    if (value > 0) days++;
    units += value;
    const day = known == null ? undefined : props.activity.get(key);
    chapters += day?.chapters ?? 0;
    if ((day?.chapters ?? 0) > 0) chapterDays++;
    for (const id of day?.bookIds ?? []) books.add(id);
    if ((day?.bookIds.length ?? 0) > 0) bookDays++;
  }
  return { units, chapters, chapterDays, books: books.size, bookDays, days, longest };
}

function currentStreak(props: DiaryMonthProps) {
  let key =
    (props.activity.get(props.today)?.units ?? 0) > 0 ? props.today : previousDay(props.today);
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
  stacked,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  accent?: boolean;
  atLeast?: boolean;
  value: number | null;
  label: string;
  tooltip: string;
  stacked: boolean;
}) {
  const color = useThemeColor(
    accent && value != null && value > 0 ? '--color-accent' : '--color-muted',
  );
  const stat = (
    <View
      accessible
      accessibilityLabel={value == null ? label : `${atLeast ? 'at least ' : ''}${value} ${label}`}
      className={cn(
        'gap-1',
        stacked ? 'flex-row items-center gap-2' : 'sm:flex-row sm:items-center sm:gap-2',
      )}
    >
      <View className="flex-row items-center gap-2">
        <Ionicons color={color} name={icon} size={22} />
        {value == null ? (
          <Skeleton className="h-6 w-10 rounded my-0.5" />
        ) : (
          <MorphText className="text-foreground font-sans-semibold text-xl">{`${formatCount(value)}${atLeast ? '+' : ''}`}</MorphText>
        )}
      </View>
      <Text className="shrink text-muted font-sans text-xs" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
  return value == null ? stat : <Tooltip label={tooltip}>{stat}</Tooltip>;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function monthGrid(month: string) {
  const first = keyDate(month);
  const length = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const keys = Array.from({ length }, (_, day) => `${month}-${`${day + 1}`.padStart(2, '0')}`);
  const cells: Array<string | null> = [
    ...Array.from({ length: (first.getUTCDay() + 6) % 7 }, () => null),
    ...keys,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );
  return { keys, weeks };
}

const CELL = 'flex-1 min-h-11 aspect-square';
const SHADE_TRANSITION: CSSTransitionProperties = {
  transitionProperty: 'backgroundColor',
  transitionDuration: DURATION.swap,
  transitionTimingFunction: EASE_OUT,
};

export function DiaryMonth({
  className,
  loading = false,
  ...props
}: DiaryMonthProps & { className?: string; loading?: boolean }) {
  const stacked = props.stacked === true;
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
  const incomplete = partial || (isCurrent && !loading && streak.partial);
  const name = MONTH_NAMES[first.getUTCMonth()];
  const title = props.today.startsWith(`${year}`) ? name : `${name} ${year}`;

  return (
    <View className={cn('pt-1 pb-2', tight ? 'px-0' : 'px-6', className)}>
      <Eyebrow className={cn('mb-3', tight && 'mx-6')}>{title}</Eyebrow>
      <View className={cn('gap-5', !stacked && 'sm:flex-row sm:gap-10')}>
        <View className="w-full max-w-96">
          <View className={cn('flex-row', !tight && 'gap-1 mb-0.5')}>
            {WEEKDAY_INITIALS.map((initial, index) => (
              <Text
                className="flex-1 text-center text-muted font-sans text-[10px] leading-3"
                key={index}
              >
                {initial}
              </Text>
            ))}
          </View>
          {/* Spacing lives inside each cell's Tooltip/pressable so sweeping across days hits no dead gap. */}
          <View className={cn(!tight && '-mx-0.5')}>
            {weeks.map((week, row) => (
              <View className="flex-row" key={row}>
                {week.map((key, column) => {
                  if (key == null) return <View className={CELL} key={column} />;
                  const future = key > props.today;
                  const units = loading ? null : dayUnits(key, props);
                  const shade = units == null ? null : level(units);
                  const cell = (
                    <AnimatedView
                      style={SHADE_TRANSITION}
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
                          shade === 4
                            ? 'text-accent-foreground'
                            : shade === 3
                              ? 'text-foreground dark:text-accent-foreground'
                              : shade != null && shade > 0
                                ? 'text-foreground'
                                : 'text-muted',
                          units == null && !loading && 'opacity-40',
                        )}
                      >
                        {Number(key.slice(8))}
                      </Text>
                    </AnimatedView>
                  );
                  if (future || loading)
                    return (
                      <View className={cn(CELL, !tight && 'p-0.5')} key={key}>
                        {cell}
                      </View>
                    );
                  const label = dayTooltip(key, units, props);
                  const onSelectDay = props.onSelectDay;
                  return (
                    <View className={CELL} key={key}>
                      <Tooltip fill label={label}>
                        {units != null && units > 0 && onSelectDay != null ? (
                          <PresstableOpacity
                            accessibilityLabel={label}
                            accessibilityRole="button"
                            className={cn('flex-1', !tight && 'p-0.5')}
                            onPress={() => onSelectDay(key)}
                          >
                            {cell}
                          </PresstableOpacity>
                        ) : (
                          <View
                            accessible
                            accessibilityLabel={label}
                            className={cn('flex-1', !tight && 'p-0.5')}
                          >
                            {cell}
                          </View>
                        )}
                      </Tooltip>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
        <View className={cn(!stacked && 'sm:shrink sm:pt-4', tight && 'px-6')}>
          <View className={cn(stacked ? 'gap-3' : 'flex-row flex-wrap gap-6 sm:flex-col sm:gap-3')}>
            {isCurrent && (
              <Stat
                stacked={stacked}
                accent
                atLeast={!loading && streak.partial}
                icon="flame"
                label="day streak"
                tooltip={
                  streak.streak > 0
                    ? `Since ${date(streak.since)}`
                    : 'Log something today to start one'
                }
                value={loading ? null : streak.streak}
              />
            )}
            <Stat
              stacked={stacked}
              atLeast={partial}
              icon="trophy"
              label="longest streak"
              tooltip={
                longest.length === 0
                  ? `Nothing logged in ${name}`
                  : longest.length === 1
                    ? date(longest.from)
                    : `${date(longest.from)} – ${date(longest.to)}`
              }
              value={loading ? null : longest.length}
            />
            {props.reading != null ? (
              <>
                {props.reading.chapters && (
                  <Stat
                    stacked={stacked}
                    atLeast={partial}
                    icon="book"
                    label={stats.chapters === 1 ? 'chapter' : 'chapters'}
                    tooltip={`Across ${stats.chapterDays} ${stats.chapterDays === 1 ? 'day' : 'days'}`}
                    value={loading ? null : stats.chapters}
                  />
                )}
                {props.reading.books && (
                  <Stat
                    stacked={stacked}
                    atLeast={partial}
                    icon="library"
                    label={stats.books === 1 ? 'book' : 'books'}
                    tooltip={`Across ${stats.bookDays} ${stats.bookDays === 1 ? 'day' : 'days'}`}
                    value={loading ? null : stats.books}
                  />
                )}
              </>
            ) : (
              <Stat
                stacked={stacked}
                atLeast={partial}
                icon="play-circle"
                label={`logged in ${name}`}
                tooltip={`Across ${stats.days} ${stats.days === 1 ? 'day' : 'days'}`}
                value={loading ? null : stats.units}
              />
            )}
          </View>
          {props.onLoadMore != null && (
            <Collapse open={incomplete}>
              <View className="items-start pt-5">
                <Button
                  icon={<Button.Icon name="chevron-down" />}
                  label="Load more"
                  loading={props.loadingMore}
                  onPress={props.onLoadMore}
                  size="sm"
                  variant="quiet"
                />
              </View>
            </Collapse>
          )}
        </View>
      </View>
    </View>
  );
}

const NO_ACTIVITY: ReadonlyMap<string, DaySummary> = new Map();

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
