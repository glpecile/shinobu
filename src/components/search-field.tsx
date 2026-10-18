import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRef, useState, type RefObject } from 'react';
import { TextInput, View } from 'react-native';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import { Spinner } from '@/components/spinner';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

/**
 * Shared search chrome. The clear target is beside the input, since an
 * overlapping pressable loses touches to Android's EditText. The input can
 * shrink below its intrinsic web width so the clear control stays reachable.
 * See android-pressable-over-textinput.md and firefox-flex-input-wont-shrink.md
 * in docs/solutions/.
 */
export function SearchField({ value, onChangeText, onClear, loading, placeholder, accessibilityLabel, autoFocus, ref, className }: {
  value: string;
  onChangeText: (value: string) => void;
  onClear?: () => void;
  loading: boolean;
  placeholder: string;
  accessibilityLabel: string;
  autoFocus?: boolean;
  ref?: RefObject<TextInput | null>;
  /** Layout only. */
  className?: string;
}) {
  const ownRef = useRef<TextInput>(null);
  const inputRef = ref ?? ownRef;
  const [focused, setFocused] = useState(false);
  const muted = useThemeColor('--color-muted');
  const accent = useThemeColor('--color-accent');
  const border = useThemeColor('--color-border');
  return (
    <AnimatedView
      className={cn('flex-row items-center border bg-surface rounded-full', className)}
      style={{
        borderColor: focused ? accent : border,
        transitionProperty: 'borderColor',
        transitionDuration: DURATION.color,
        transitionTimingFunction: EASE_OUT,
      }}
    >
      <View className="ps-4">
        <View className="size-5 items-center justify-center">
          {loading ? <Spinner accessibilityLabel="Searching" /> : <Ionicons color={muted} name="search-outline" size={18} />}
        </View>
      </View>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        className="flex-1 min-h-11 min-w-0 text-base text-foreground ps-3 pe-4 py-3 font-sans outline-none caret-accent"
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={muted}
        ref={inputRef}
        returnKeyType="search"
        selectionColor={accent}
        value={value}
      />
      {value !== '' && (
        <PresstableOpacity
          accessibilityLabel="Clear search"
          accessibilityRole="button"
          className="w-11 h-11 items-center justify-center"
          onPress={() => {
            if (onClear) onClear();
            else onChangeText('');
            inputRef.current?.focus();
          }}
        >
          <View className="w-6 h-6 items-center justify-center rounded-full bg-border">
            <Ionicons color={muted} name="close" size={14} />
          </View>
        </PresstableOpacity>
      )}
    </AnimatedView>
  );
}
