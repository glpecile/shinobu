import Ionicons from '@react-native-vector-icons/ionicons/static';
import { createContext, type ReactNode, useContext } from 'react';
import { ActivityIndicator, Platform, Text } from 'react-native';
import {
  type CSSTransitionProperties,
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { MorphText } from '@/components/morph-text';
import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor, type ThemeColorToken } from '@/lib/theme-color';

export type ButtonVariant = 'primary' | 'outline' | 'quiet';
export type ButtonSize = 'sm' | 'md';

/** Container classes per variant — `off` covers both disabled and loading. */
const CONTAINER: Record<ButtonVariant, { on: string; off: string }> = {
  primary: { on: 'bg-accent', off: 'bg-accent/40' },
  outline: { on: 'border border-accent', off: 'border border-accent/40' },
  quiet: { on: 'border border-border', off: 'border border-border opacity-60' },
};

const LABEL: Record<ButtonVariant, { on: string; off: string }> = {
  primary: { on: 'text-accent-foreground', off: 'text-accent-foreground' },
  outline: { on: 'text-accent', off: 'text-accent/60' },
  quiet: { on: 'text-foreground', off: 'text-muted' },
};

/** The theme token the spinner borrows so it matches its own label exactly. */
const SPINNER_TOKEN: Record<ButtonVariant, ThemeColorToken> = {
  primary: '--color-accent-foreground',
  outline: '--color-accent',
  quiet: '--color-foreground',
};

const BOX_LAYOUT =
  Platform.OS === 'web' ? undefined : LinearTransition.duration(DURATION.swap);
const SLOT_ENTER = FadeIn.duration(DURATION.swap);
// No exit fade on web: Reanimated implements an exiting element there by
// re-parenting it into an absolutely positioned clone, which takes the icon
// out of the flex flow and recenters the label flush against it for the frames
// the sheet around it is closing. The slot simply drops out on web instead.
// docs/solutions/reanimated-web-exiting-pulls-child-out-of-flow.md
const SLOT_EXIT =
  Platform.OS === 'web' ? undefined : FadeOut.duration(DURATION.exit);
const COLOR_TRANSITION: CSSTransitionProperties = {
  transitionProperty: ['backgroundColor', 'borderColor', 'opacity'],
  transitionDuration: DURATION.color,
  transitionTimingFunction: EASE_OUT,
};

const SIZE: Record<ButtonSize, { container: string; label: string; icon: number }> = {
  sm: { container: 'px-3 py-2 gap-1.5', label: 'text-sm', icon: 14 },
  md: { container: 'px-5 py-3 gap-2', label: 'text-base', icon: 18 },
};

/** A notch under the leading glyph: it marks, it doesn't name. */
const TRAILING_ICON: Record<ButtonSize, number> = { sm: 12, md: 16 };

/**
 * What `Button.Icon` needs to draw itself, supplied by the `Button` around it.
 *
 * Compound-component style on purpose (AGENTS.md: promote to this pattern when
 * a parent/children structure has implicit shared state; `components/steps.tsx`
 * is the reference). The shared state here is *appearance*: an icon has to take
 * its colour from the button's variant and its size from the button's size, and
 * dim in lockstep when the button is disabled or loading. Passing those as props
 * would mean every call site restating `color={accent} size={18}` — three
 * chances to drift from the label beside it, which is exactly how `rounded`
 * ended up next to `rounded-md` before `components/button` existed.
 */
const ButtonIconContext = createContext<{ token: ThemeColorToken; size: number } | null>(
  null,
);

/**
 * An icon inside a `Button`, coloured and sized by that button.
 *
 * ```tsx
 * <Button icon={<Button.Icon name="bookmark-outline" />} label="Add to watchlist" />
 * ```
 *
 * **Every button in the app takes one.** A label without a glyph beside it
 * reads as a different design system than the row above it, which is how the
 * log sheet ended up as the one dialog with no icons anywhere. The app's
 * vocabulary — one verb, one glyph, everywhere:
 *
 * | glyph | verb |
 * | --- | --- |
 * | `eye-outline` / `eye` | log a watch — filled once it's already in your history |
 * | `eye-off-outline` | hide from a feed |
 * | `bookmark-outline` / `bookmark` | watchlist — filled once it's on the list |
 * | `trash-outline` | deletes stored data |
 * | `refresh` | retry |
 * | `open-outline` | leaves this screen (a route, an external page) |
 * | `close` | dismiss without writing |
 * | `search-outline` | search |
 * | `checkmark` | done, nothing left to do |
 * | `link-outline` / `unlink-outline` | connect / disconnect a tracker |
 *
 * Outside a `Button` it renders nothing rather than guessing a colour — a
 * mis-coloured icon on an accent fill is invisible, and silence is the more
 * debuggable failure.
 */
function ButtonIcon({ name }: { name: React.ComponentProps<typeof Ionicons>['name'] }) {
  const context = useContext(ButtonIconContext);
  const color = useThemeColor(context?.token ?? '--color-foreground');
  if (context == null) return null;
  return (
    <Ionicons
      color={color}
      name={name}
      size={context.size}
    />
  );
}

/** The corner treatment, applied to the pressable and its drawn box alike. */
const SHAPE: Record<ButtonShape, string> = {
  rounded: 'rounded-md',
  pill: 'rounded-full',
};

export type ButtonShape = 'rounded' | 'pill';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /**
   * A `<Button.Icon name="…" />`, drawn before the label and inheriting this
   * button's colour and size. A node rather than an icon name so the button
   * never grows a second icon-set dependency in its own signature, and so a
   * call site can pass nothing at all without a sentinel.
   *
   * Hidden while `loading`: the spinner already occupies that slot, and showing
   * both makes the row jump as the spinner mounts.
   */
  icon?: ReactNode;
  /**
   * A second `<Button.Icon />` (or a provider mark), drawn at the button's far
   * edge. An affordance marker, not an action — "this leaves the app" — so
   * unlike `icon` it survives `loading`: the spinner takes the leading slot,
   * and a trailing glyph vanishing mid-press would read as the row changing
   * into a different row.
   */
  trailingIcon?: ReactNode;
  /**
   * `center` (default) is a CTA. `start` is a **row** — one of a stack of
   * actions in a sheet, where the labels line up down a left edge and the
   * leading glyphs form a column beside them.
   *
   * It exists because the long-press sheets hand-rolled that shape around the
   * gap instead (AGENTS.md: widen the button, never re-implement it), and it
   * drifted the moment they did — a muted glyph beside a foreground label, no
   * press state, and `rounded-full` restated by hand at each call site.
   */
  align?: 'center' | 'start';
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** `pill` (default, fully round — owner decision 2026-09-08) or `rounded` (8px). */
  shape?: ButtonShape;
  /**
   * Shows a spinner, swaps in `loadingLabel`, and blocks the press. Every
   * button that awaits something — an OAuth round-trip, a token validation, a
   * log fan-out — should drive this rather than only changing its text, so the
   * wait reads as progress instead of a dead tap.
   */
  loading?: boolean;
  /** Reads while `loading`. Defaults to the normal label. */
  loadingLabel?: string;
  disabled?: boolean;
  /**
   * Render the label with `MorphText` — for a label that *changes in place*
   * from user state (the details screen's "Mark as watched" → "Log episode 4").
   * Off by default: morphing static text is noise, and first render never
   * animates anyway (AGENTS.md: Tech Stack → torph).
   */
  morphLabel?: boolean;
  accessibilityLabel?: string;
  /**
   * Layout only — `shrink-0`, `self-start`, `self-stretch`, `mt-2`.
   * Deliberately last in the `cn` chain so it wins, but appearance belongs to
   * `variant`/`size`/`shape`.
   *
   * **Not padding.** It lands on the pressable, which wraps the drawn box, so a
   * `px-8` here doesn't widen the button — it wraps it in 32px of invisible
   * padding and takes that width away from the label instead. That is how the
   * Home CTA ended up rendering "Connect your trackers" over three lines inside
   * a squat red block on a phone. Reach for `size`, or `self-stretch`.
   */
  className?: string;
}

/**
 * The app's button.
 *
 * Every call site used to hand-roll `PresstableOpacity` + `Text` with its own
 * padding, radius and disabled treatment, which is how `rounded` (4px, reads as
 * an accident) ended up next to `rounded-md`, and how "Connecting…" shipped as
 * a text swap with no spinner. Three variants cover what the app actually
 * needs: `primary` (the one action), `outline` (destructive/secondary, accent
 * on transparent) and `quiet` (neutral, bordered).
 *
 * Width is inherited, not owned: in a stretch container (a sheet, a form
 * column) it fills; in a row it hugs. That's the same behaviour the
 * hand-rolled buttons had, so adopting it never moves a layout.
 *
 * `accessibilityRole="button"` is not optional — RNGH's web gesture handler
 * only dispatches presses on elements whose DOM role is `button`
 * (docs/solutions/web-pressto-accessibility-role-kills-onpress.md).
 */
export function Button({
  label,
  onPress,
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
  accessibilityLabel,
  className,
}: ButtonProps) {
  const spinnerToken = useThemeColor(SPINNER_TOKEN[variant]);
  const spinnerColor =
    spinnerToken;
  const unavailable = disabled || loading;
  // `self-center` rather than `text-center` for the morph variant: the morph
  // span shrink-wraps on web, so it has to center as a flex item instead of
  // aligning text inside a full-width box.
  const LabelText = morphLabel ? MorphText : Text;
  const shownLabel = loading ? (loadingLabel ?? label) : label;
  const overlay = loading && loadingLabel == null;

  return (
    <PresstableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable }}
      // Layout only out here. The *box* is the inner View, because a border on
      // a pressto pressable is never drawn on Android — RNGH's native button
      // supplies its own background drawable, and that's the same drawable
      // React Native draws borders with, so `border` silently disappears while
      // `backgroundColor` survives (a filled button looked fine; every outlined
      // one rendered as bare text).
      // docs/solutions/pressto-border-not-drawn-on-android.md
      className={cn(SHAPE[shape], className)}
      // `disabled` really does gate the press (pressto → RNGH `enabled`,
      // verified on web), but it reaches the DOM as nothing at all: neither it
      // nor `accessibilityState` becomes an ARIA attribute, so a screen reader
      // hears an ordinary button while a fan-out is in flight. These two say so
      // (docs/solutions/pressto-accessibility-state-not-mapped-on-web.md).
      aria-busy={loading}
      aria-disabled={unavailable}
      disabled={unavailable}
      onPress={onPress}
    >
      <AnimatedView
        className={cn(
          'flex-row items-center',
          align === 'start' ? 'justify-start' : 'justify-center',
          SHAPE[shape],
          SIZE[size].container,
          unavailable ? CONTAINER[variant].off : CONTAINER[variant].on,
        )}
        layout={BOX_LAYOUT}
        style={COLOR_TRANSITION}
      >
        {loading && (
          // Wrapped so the spinner keeps its own box on native, where an
          // ActivityIndicator dropped straight into a flex row can stretch.
          <AnimatedView
            className={cn(
              'items-center justify-center',
              overlay && 'absolute inset-0',
            )}
            entering={SLOT_ENTER}
            exiting={SLOT_EXIT}
            layout={BOX_LAYOUT}
          >
            <ActivityIndicator color={spinnerColor} size="small" />
          </AnimatedView>
        )}
        {icon != null && !loading && (
          // Same own-box wrapper as the spinner, for the same native reason.
          // The dimming rides here rather than on the icon so `Button.Icon`
          // stays a pure "draw this glyph" leaf: the icon inherits one colour
          // and the *button* decides how faded that colour reads, exactly as
          // the container and label treatments already do.
          <AnimatedView
            className="items-center justify-center"
            entering={SLOT_ENTER}
            exiting={SLOT_EXIT}
            layout={BOX_LAYOUT}
          >
            {/* The dim sits one level in, not on the node above: `SLOT_ENTER`
                is a FadeIn, and an entering animation owns `opacity` on its
                own node — a disabled icon mounted at 60% was faded back to
                full by its own enter, and Reanimated warned about exactly
                that. docs/solutions/reanimated-fade-overwrites-static-opacity.md */}
            <AnimatedView
              className={cn(unavailable && 'opacity-60')}
              style={COLOR_TRANSITION}
            >
              <ButtonIconContext.Provider
                value={{ token: SPINNER_TOKEN[variant], size: SIZE[size].icon }}
              >
                {icon}
              </ButtonIconContext.Provider>
            </AnimatedView>
          </AnimatedView>
        )}
        <AnimatedView
          // A row's label takes the free space so a trailing glyph is pushed
          // to the far edge rather than sitting against the label's last word.
          className={cn(overlay && 'opacity-0', align === 'start' && 'flex-1')}
          layout={BOX_LAYOUT}
          style={COLOR_TRANSITION}
        >
          <LabelText
            className={cn(
              'font-sans-semibold',
              morphLabel ? 'self-center' : align === 'start' ? undefined : 'text-center',
              SIZE[size].label,
              unavailable ? LABEL[variant].off : LABEL[variant].on,
            )}
          >
            {shownLabel}
          </LabelText>
        </AnimatedView>
        {trailingIcon != null && (
          // No enter/exit and no `loading` gate — see `trailingIcon`'s
          // docblock. Muted, because it marks where the press *goes* rather
          // than naming the action the way the leading glyph does.
          <AnimatedView
            className={cn('items-center justify-center opacity-60')}
            layout={BOX_LAYOUT}
            style={COLOR_TRANSITION}
          >
            <ButtonIconContext.Provider
              value={{ token: SPINNER_TOKEN[variant], size: TRAILING_ICON[size] }}
            >
              {trailingIcon}
            </ButtonIconContext.Provider>
          </AnimatedView>
        )}
      </AnimatedView>
    </PresstableOpacity>
  );
}

Button.Icon = ButtonIcon;
