import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRef } from 'react';
import type { TextInputInstance } from 'react-native';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { useThemeColor } from '@/lib/theme-color';

/**
 * A log form's "how far" field: a number typed in the middle or stepped with
 * the button either side, over a note that an error replaces. The caller owns
 * the value and its bounds, and disables a button at each end.
 */
export function StepperField({
  label, backLabel, forwardLabel, value, onChangeText, onStep, onBlur,
  canStepBack, canStepForward, note, error, pending, className,
}: {
  label: string;
  backLabel: string;
  forwardLabel: string;
  value: string;
  onChangeText: (text: string) => void;
  onStep: (by: 1 | -1) => void;
  onBlur?: () => void;
  canStepBack: boolean;
  canStepForward: boolean;
  note?: string;
  error?: string;
  pending: boolean;
  className?: string;
}) {
  const input = useRef<TextInputInstance>(null);
  const muted = useThemeColor('--color-muted');
  const accent = useThemeColor('--color-accent');
  const line = error ?? note;

  function step(by: 1 | -1) {
    haptics.selection();
    onStep(by);
  }

  return (
    <View className={cn('gap-2', pending && 'opacity-50', className)}>
      <Text
        className="text-foreground font-sans-semibold text-sm"
        onPress={() => input.current?.focus()}
      >
        {label}
      </Text>
      <View className="flex-row items-center gap-3">
        <Button
          disabled={pending || !canStepBack}
          icon={<Button.Icon name="chevron-back" />}
          iconOnly
          label={backLabel}
          onPress={() => step(-1)}
          pressBehavior="immediate"
          variant="quiet"
        />
        <View className="flex-1">
          <TextField
            ref={input}
            accessibilityHint={note}
            accessibilityLabel={label}
            editable={!pending}
            inputMode="numeric"
            onBlur={onBlur}
            onChangeText={onChangeText}
            returnKeyType="done"
            selectTextOnFocus
            textAlign="center"
            value={value}
          />
        </View>
        <Button
          disabled={pending || !canStepForward}
          icon={<Button.Icon name="chevron-forward" />}
          iconOnly
          label={forwardLabel}
          onPress={() => step(1)}
          pressBehavior="immediate"
          variant="quiet"
        />
      </View>
      {line != null && (
        // Keyed so an error mounts as a new alert, which a screen reader
        // announces; flipping the role on a mounted note may not be.
        <View key={error == null ? 'note' : 'error'} className="flex-row items-center gap-1.5">
          <Ionicons
            accessibilityElementsHidden
            aria-hidden
            importantForAccessibility="no"
            color={error == null ? muted : accent}
            name={error == null ? 'information-circle-outline' : 'alert-circle-outline'}
            size={16}
          />
          <Text
            className={cn('flex-1 font-sans text-xs', error == null ? 'text-muted' : 'text-accent')}
            role={error == null ? undefined : 'alert'}
          >
            {line}
          </Text>
        </View>
      )}
    </View>
  );
}
