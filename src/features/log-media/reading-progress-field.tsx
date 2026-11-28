import { useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { NativeSegmentedControl } from '@/components/native-segmented-control';
import { NativeSwitch } from '@/components/native-switch';
import { TextField } from '@/components/text-field';
import { cn } from '@/lib/cn';
import { setReadingInPages, useReadingInPages } from '@/state/prefs/reading-unit';
import { ProgressScrubber } from './progress-scrubber';
import { pageAt, percentRead, stepPage } from './reading-share';
import { StepperField } from './stepper-field';
import { useHoldRepeat } from './use-hold-repeat';

export interface ReadingProgress {
  finished: boolean;
  page: number;
  total?: number;
  reread?: boolean;
}

export function readingSpan(reading: ReadingProgress, inPages: boolean): string | undefined {
  if (reading.finished || reading.page <= 0) return undefined;
  return reading.total != null && !inPages
    ? `${percentRead(reading.page, reading.total)}%`
    : `page ${reading.page}`;
}

export function readingTitle(reading: ReadingProgress, inPages: boolean): string {
  if (reading.finished) return reading.reread === true ? 'Log reread' : 'Mark as read';
  const span = readingSpan(reading, inPages);
  if (span != null) return `Log ${span}`;
  return reading.reread === true ? 'Start reread' : 'Start reading';
}

const LAST_PAGE = 99999;

const UNITS = [
  { value: 'percent', label: '%', accessibilityLabel: 'Percent' },
  { value: 'pages', label: 'pg', accessibilityLabel: 'Pages' },
] as const;

interface FieldProps {
  value: ReadingProgress;
  onChange: (update: (reading: ReadingProgress) => ReadingProgress) => void;
  pending: boolean;
}

export function ReadingProgressField(props: FieldProps) {
  const { total } = props.value;
  return total == null ? <PageField {...props} /> : <ShareField {...props} total={total} />;
}

function ShareField({ value, onChange, pending, total }: FieldProps & { total: number }) {
  const input = useRef<TextInputInstance>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const page = value.finished ? total : Math.min(value.page, total);
  const percent = percentRead(page, total);
  const inPages = useReadingInPages();
  const setPage = (next: number) =>
    onChange((reading) => ({ ...reading, page: next, finished: next >= total }));
  const step = (by: 1 | -1) => {
    setDraft(null);
    onChange((reading) => {
      const from = reading.finished ? total : Math.min(reading.page, total);
      const next = stepPage(from, total, by, inPages);
      return { ...reading, page: next, finished: next >= total };
    });
  };

  const back = useHoldRepeat(() => step(-1), !pending && page > 0);
  const forward = useHoldRepeat(() => step(1), !pending && page < total);

  return (
    <View
      className={cn('mt-5 gap-1', pending && 'opacity-50')}
      style={{ pointerEvents: pending ? 'none' : 'auto' }}
    >
      <View className="mb-2 flex-row items-center gap-2">
        <Text
          className="flex-1 text-foreground font-sans-semibold text-sm"
          onPress={() => input.current?.focus()}
        >
          Progress
        </Text>
        <View className="flex-row items-start gap-2">
          <View className="w-20">
            <TextField
              ref={input}
              accessibilityLabel={inPages ? 'Page reached' : 'Percent read'}
              editable={!pending}
              inputMode="numeric"
              onBlur={() => setDraft(null)}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, '');
                const typed = Math.min(inPages ? total : 100, Number(digits));
                setDraft(digits === '' ? '' : String(typed));
                setPage(inPages ? typed : pageAt(typed, total));
              }}
              returnKeyType="done"
              selectTextOnFocus
              size="sm"
              textAlign="center"
              value={draft ?? String(inPages ? page : percent)}
            />
          </View>
          <NativeSegmentedControl
            accessibilityLabel="Unit"
            className="h-9 w-24"
            onChange={(unit) => {
              setDraft(null);
              setReadingInPages(unit === 'pages');
            }}
            options={UNITS}
            size="sm"
            value={inPages ? 'pages' : 'percent'}
          />
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        <Button
          disabled={pending || page <= 0}
          icon={<Button.Icon name="remove" />}
          iconOnly
          label={inPages ? 'Previous page' : 'Down 1%'}
          {...back}
          pressBehavior="immediate"
          variant="quiet"
        />
        <View className="flex-1 px-3">
          <ProgressScrubber
            disabled={pending}
            onChange={(next) => {
              setDraft(null);
              setPage(next);
            }}
            onStep={step}
            page={page}
            total={total}
          />
        </View>
        <Button
          disabled={pending || page >= total}
          icon={<Button.Icon name="add" />}
          iconOnly
          label={inPages ? 'Next page' : 'Up 1%'}
          {...forward}
          pressBehavior="immediate"
          variant="quiet"
        />
      </View>
      <View className="flex-row justify-between">
        {page >= total ? (
          <Text className="text-success font-sans-semibold text-xs">Finished</Text>
        ) : (
          <>
            <Text className="text-muted font-sans text-xs tabular-nums">
              {inPages
                ? `${percent}%`
                : `Page ${page.toLocaleString()} of ${total.toLocaleString()}`}
            </Text>
            <Text className="text-muted font-sans text-xs tabular-nums">
              {(total - page).toLocaleString()} {total - page === 1 ? 'page' : 'pages'} left
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function PageField({ value, onChange, pending }: FieldProps) {
  const setFinished = (finished: boolean) => onChange((reading) => ({ ...reading, finished }));
  const setPage = (next: (page: number) => number) =>
    onChange((reading) => ({
      ...reading,
      page: Math.min(LAST_PAGE, Math.max(0, next(reading.page))),
    }));

  return (
    <View className="mt-5">
      <View className={cn('flex-row items-center justify-between', pending && 'opacity-50')}>
        <Text
          accessible={false}
          className="text-foreground font-sans-semibold text-sm"
          disabled={pending}
          onPress={() => setFinished(!value.finished)}
        >
          Finished the book
        </Text>
        <NativeSwitch
          accessibilityLabel="Finished the book"
          disabled={pending}
          onValueChange={setFinished}
          value={value.finished}
        />
      </View>
      {!value.finished && (
        <StepperField
          backLabel="Previous page"
          canStepBack={value.page > 0}
          canStepForward={value.page < LAST_PAGE}
          className="pt-3"
          forwardLabel="Next page"
          label="Page"
          onChangeText={(text) => setPage(() => Number(text.replace(/\D/g, '')))}
          onStep={(by) => setPage((page) => page + by)}
          pending={pending}
          value={String(value.page)}
        />
      )}
    </View>
  );
}
