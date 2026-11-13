import { Text, View } from 'react-native';

import { NativeSwitch } from '@/components/native-switch';
import { cn } from '@/lib/cn';
import { StepperField } from './stepper-field';

/** A book log's form state: the page reached, or the whole book. */
export interface ReadingProgress {
  finished: boolean;
  page: number;
  /** The edition's page count, the field's cap. Absent when Hardcover has none. */
  total?: number;
  /** The book is already Read, so this log is another read of it. */
  reread?: boolean;
}

/** The one string the book form speaks: its title and confirm label. */
export function readingTitle(reading: ReadingProgress): string {
  if (reading.finished) return reading.reread === true ? 'Log reread' : 'Mark as read';
  if (reading.page > 0) return `Log page ${reading.page}`;
  return reading.reread === true ? 'Start reread' : 'Start reading';
}

/** The page field's cap when Hardcover has no page count: the five digits it accepts. */
const LAST_PAGE = 99999;

/**
 * The book log form's progress fields (plan 0117 B3): a Finished switch, and
 * the page reached while it is off. Pages are their own unit (KTD-3). A typed
 * or stepped page stays between 0, which only starts the read, and the page
 * count, so the form never holds a page the book does not have.
 */
export function ReadingProgressField({ value, onChange, pending }: {
  value: ReadingProgress;
  onChange: (value: ReadingProgress) => void;
  pending: boolean;
}) {
  const last = value.total ?? LAST_PAGE;
  const setFinished = (finished: boolean) => onChange({ ...value, finished });
  const setPage = (page: number) => onChange({ ...value, page: Math.min(last, Math.max(0, page)) });

  return (
    <View className="mt-5">
      <View className={cn('flex-row items-center justify-between', pending && 'opacity-50')}>
        {/* The switch carries the label for screen readers. */}
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
          canStepForward={value.page < last}
          className="pt-3"
          forwardLabel="Next page"
          label="Page"
          note={value.total == null ? undefined : `Of ${value.total} pages.`}
          onChangeText={(text) => setPage(Number(text.replace(/\D/g, '').slice(0, 5)))}
          onStep={(by) => setPage(value.page + by)}
          pending={pending}
          value={String(value.page)}
        />
      )}
    </View>
  );
}
