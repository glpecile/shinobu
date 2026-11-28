import Ionicons from '@react-native-vector-icons/ionicons/static';
import { createContext, type ReactNode, useContext } from 'react';
import { Platform, Text, View } from 'react-native';
import { Spinner } from '@/components/spinner';
import { useDelayedBusy } from '@/components/use-delayed-busy';
import Svg, { Path } from 'react-native-svg';
import {
  type CSSTransitionProperties,
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { MorphText } from '@/components/morph-text';
import { PresstableOpacity, type PressBehavior } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor, type ThemeColorToken } from '@/lib/theme-color';

export type ButtonVariant = 'log' | 'primary' | 'quiet' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const CONTAINER: Record<ButtonVariant, { on: string; off: string }> = {
  log: { on: 'bg-log', off: 'bg-log/40' },
  primary: {
    on: 'border border-foreground bg-foreground',
    off: 'border border-transparent bg-foreground/40',
  },
  quiet: {
    on: 'border border-border web:hover:bg-border/40',
    off: 'border border-border opacity-60',
  },
  ghost: { on: 'web:hover:bg-border/40', off: 'opacity-60' },
};

const LABEL: Record<ButtonVariant, { on: string; off: string }> = {
  log: { on: 'text-log-foreground', off: 'text-log-foreground' },
  primary: { on: 'text-background', off: 'text-background' },
  quiet: { on: 'text-foreground', off: 'text-muted' },
  ghost: { on: 'text-foreground', off: 'text-muted' },
};

const SELECTABLE: Record<ButtonVariant, boolean> = {
  log: false,
  primary: false,
  quiet: true,
  ghost: true,
};

const SPINNER_TOKEN: Record<ButtonVariant, ThemeColorToken> = {
  log: '--color-log-foreground',
  primary: '--color-background',
  quiet: '--color-foreground',
  ghost: '--color-foreground',
};

const BOX_LAYOUT = Platform.OS === 'web' ? undefined : LinearTransition.duration(DURATION.swap);
const SLOT_ENTER = FadeIn.duration(DURATION.swap);
// No exit fade on web: Reanimated implements an exiting element there by
// re-parenting it into an absolutely positioned clone, which takes the icon
// out of the flex flow and recenters the label flush against it for the frames
// the sheet around it is closing. The slot simply drops out on web instead.
// docs/solutions/reanimated-web-exiting-pulls-child-out-of-flow.md
const SLOT_EXIT = Platform.OS === 'web' ? undefined : FadeOut.duration(DURATION.exit);
const COLOR_TRANSITION: CSSTransitionProperties = {
  transitionProperty: ['backgroundColor', 'borderColor', 'opacity'],
  transitionDuration: DURATION.color,
  transitionTimingFunction: EASE_OUT,
};

const LOADING_ENTER = {
  from: { transform: [{ translateY: 3 }, { scale: 0.9 }] },
  to: { transform: [{ translateY: 0 }, { scale: 1 }] },
};

const SIZE: Record<ButtonSize, { container: string; label: string; icon: number }> = {
  sm: { container: 'px-3 py-2 gap-1.5', label: 'text-sm', icon: 14 },
  md: { container: 'px-5 py-3 gap-2', label: 'text-base', icon: 18 },
};

const TRAILING_ICON: Record<ButtonSize, number> = { sm: 12, md: 16 };

const ButtonIconContext = createContext<{ token: ThemeColorToken; size: number } | null>(null);

/**
 * Icon inside a `Button`, coloured and sized from the parent's variant and size.
 * Renders nothing outside a `Button`.
 *
 * App glyph vocabulary (one verb, one glyph; Disconnect is the only label-only button):
 *
 * | glyph | verb |
 * | --- | --- |
 * | `eye-outline` / `eye` | log a watch — filled once it's already in your history |
 * | `eye-off-outline` | hide from a feed |
 * | `bookmark-outline` / `bookmark` | watchlist — filled once it's on the list |
 * | `trash-outline` | deletes stored data or an unsaved draft |
 * | `refresh` | retry |
 * | `open-outline` | leaves this screen (a route, an external page) |
 * | `share-outline` | share this screen's link |
 * | `close` | dismiss without writing |
 * | `search-outline` | search |
 * | `checkmark` | done, nothing left to do |
 * | `link-outline` | connect a tracker |
 * | `chevron-back` / `chevron-forward` | step to the previous / next sibling in place |
 * | `copy-outline` | copy text to the clipboard |
 * | `heart-outline` / `heart` | like — filled when selected |
 * | `swap-vertical-outline` | sort titles |
 * | `chevron-down` | show options or load more |
 * | `add` / `remove` | add a title or create a list; step a number up / down |
 * | `list-outline` | open a list |
 * | `create-outline` | rename or edit in place |
 * | `pause` | pause tracking a series or book |
 * | `close-circle-outline` | drop: stop tracking, history stays |
 * | `ellipsis-horizontal` | open a title's secondary actions |
 */
function ButtonIcon({ name }: { name: React.ComponentProps<typeof Ionicons>['name'] }) {
  const context = useContext(ButtonIconContext);
  const color = useThemeColor(context?.token ?? '--color-foreground');
  if (context == null) return null;
  let path: string | undefined;
  switch (name) {
    case 'chevron-back':
      path = 'm15 6-6 6 6 6';
      break;
    case 'chevron-forward':
      path = 'm9 6 6 6-6 6';
      break;
    case 'tv-outline':
      path = 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z M8 20h8';
      break;
    default:
      break;
  }
  if (path != null) {
    return (
      <Svg height={context.size} viewBox="0 0 24 24" width={context.size}>
        <Path
          d={path}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
        />
      </Svg>
    );
  }
  return <Ionicons color={color} name={name} size={context.size} />;
}

const SHAPE: Record<ButtonShape, string> = {
  rounded: 'rounded-md',
  pill: 'rounded-full',
};

export type ButtonShape = 'rounded' | 'pill';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  align?: 'center' | 'start';
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  morphLabel?: boolean;
  numberOfLines?: number;
  accessibilityLabel?: string;
  iconOnly?: boolean;
  pressed?: boolean;
  pressBehavior?: PressBehavior;
  className?: string;
}

export function Button({
  label,
  onPress,
  onPressIn,
  onPressOut,
  icon,
  trailingIcon,
  align = 'center',
  variant = 'primary',
  size = 'md',
  shape = 'pill',
  loading = false,
  loadingLabel,
  disabled = false,
  morphLabel = false,
  numberOfLines,
  accessibilityLabel,
  iconOnly = false,
  pressed,
  pressBehavior,
  className,
}: ButtonProps) {
  const reduceMotion = useReducedMotion();
  const busy = useDelayedBusy(loading);
  const unavailable = disabled || loading || busy;
  const pressedState = SELECTABLE[variant] ? pressed : undefined;
  const selected = pressedState === true;
  const tonalSelected = selected && !iconOnly;
  const glyphToken: ThemeColorToken = tonalSelected
    ? '--color-accent-on-tonal'
    : selected
      ? '--color-accent'
      : SPINNER_TOKEN[variant];
  const spinnerColor = useThemeColor(glyphToken);
  const LabelText = morphLabel ? MorphText : Text;
  const shownLabel = busy ? (loadingLabel ?? label) : label;
  const overlay = busy && loadingLabel == null;
  const contentTransition: CSSTransitionProperties & { transform: { translateY: number }[] } = {
    ...COLOR_TRANSITION,
    transitionProperty: ['opacity', 'transform'],
    transitionDuration: DURATION.swap,
    transform: [{ translateY: overlay && !reduceMotion ? -3 : 0 }],
  };

  return (
    <PresstableOpacity
      accessibilityLabel={accessibilityLabel ?? (iconOnly ? label : undefined)}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable, selected: pressedState }}
      className={cn(
        SHAPE[shape],
        'web:focus-visible:outline-2 web:focus-visible:outline-foreground web:focus-visible:outline-offset-2',
        iconOnly && 'min-w-11 min-h-11 items-center justify-center',
        className,
      )}
      // `accessibilityState` never becomes ARIA on web, so a screen reader
      // would hear an idle button while a fan-out is in flight. These say it
      // (docs/solutions/pressto-accessibility-state-not-mapped-on-web.md).
      aria-busy={loading}
      aria-disabled={unavailable}
      aria-pressed={pressedState}
      disabled={unavailable}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      pressBehavior={pressBehavior}
    >
      <LayoutAnimationConfig skipEntering skipExiting>
        <AnimatedView
          className={cn(
            'flex-row items-center',
            align === 'start' ? 'justify-start' : 'justify-center',
            SHAPE[shape],
            iconOnly
              ? cn(size === 'sm' ? 'size-9.5' : 'size-11', 'shrink-0')
              : SIZE[size].container,
            tonalSelected
              ? cn(
                  'bg-accent-tonal',
                  variant === 'quiet' && 'border border-border',
                  unavailable && 'opacity-60',
                )
              : unavailable
                ? CONTAINER[variant].off
                : CONTAINER[variant].on,
          )}
          layout={BOX_LAYOUT}
          style={COLOR_TRANSITION}
        >
          {busy && (
            // Wrapped so the spinner keeps its own box on native, where an
            // ActivityIndicator dropped straight into a flex row can stretch.
            <AnimatedView
              className={cn('items-center justify-center', overlay && 'absolute inset-0')}
              entering={SLOT_ENTER}
              exiting={SLOT_EXIT}
              layout={BOX_LAYOUT}
            >
              <AnimatedView
                style={
                  reduceMotion
                    ? undefined
                    : {
                        transform: LOADING_ENTER.from.transform,
                        animationName: LOADING_ENTER,
                        animationDuration: DURATION.swap,
                        animationTimingFunction: EASE_OUT,
                        animationFillMode: 'both',
                      }
                }
              >
                <Spinner color={spinnerColor} />
              </AnimatedView>
            </AnimatedView>
          )}
          {icon != null && (overlay || !busy) && (
            <AnimatedView
              className="items-center justify-center"
              entering={SLOT_ENTER}
              exiting={SLOT_EXIT}
              layout={BOX_LAYOUT}
            >
              {/* Dim sits inside the FadeIn node: Reanimated entering animations own
                  opacity (docs/solutions/reanimated-fade-overwrites-static-opacity.md). */}
              <AnimatedView
                className={cn(overlay ? 'opacity-0' : unavailable && 'opacity-60')}
                style={contentTransition}
              >
                <ButtonIconContext.Provider
                  value={{ token: glyphToken, size: SIZE[size].icon }}
                >
                  {icon}
                </ButtonIconContext.Provider>
              </AnimatedView>
            </AnimatedView>
          )}
          {!iconOnly && (
            <AnimatedView
              // Grow from the label's intrinsic width: flex-1's zero basis hides
              // it in content-sized native buttons. Stretch rows still push the
              // trailing glyph to the far edge.
              className={cn('min-w-0 shrink', overlay && 'opacity-0', align === 'start' && 'grow')}
              layout={BOX_LAYOUT}
              style={contentTransition}
            >
              <LabelText
                numberOfLines={numberOfLines}
                className={cn(
                  'font-sans-semibold',
                  morphLabel ? 'self-center' : align === 'start' ? undefined : 'text-center',
                  SIZE[size].label,
                  tonalSelected
                    ? 'text-accent-on-tonal'
                    : unavailable
                      ? LABEL[variant].off
                      : LABEL[variant].on,
                )}
              >
                {shownLabel}
              </LabelText>
            </AnimatedView>
          )}
          {trailingIcon != null && (
            <AnimatedView
              className={cn('items-center justify-center opacity-60')}
              layout={BOX_LAYOUT}
              style={COLOR_TRANSITION}
            >
              <ButtonIconContext.Provider
                value={{ token: glyphToken, size: TRAILING_ICON[size] }}
              >
                {trailingIcon}
              </ButtonIconContext.Provider>
            </AnimatedView>
          )}
        </AnimatedView>
      </LayoutAnimationConfig>
    </PresstableOpacity>
  );
}

function ButtonCapsule({
  floating = false,
  className,
  children,
}: {
  floating?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <View
      className={cn(
        'flex-row items-center rounded-full border border-border',
        floating ? 'p-1.25 bg-surface shadow-md' : 'p-0.5',
        className,
      )}
    >
      {children}
    </View>
  );
}

Button.Icon = ButtonIcon;
Button.Capsule = ButtonCapsule;
