import Ionicons from '@react-native-vector-icons/ionicons/static';
import { usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { emitSearchFocusRequest } from '@/features/search/focus-signal';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import {
  toggleSidebarCollapsed,
  useSidebarCollapsed,
} from '@/state/prefs/sidebar';

const RAIL_WIDTH = 64;
/** Fixed icon column so icons never shift between expanded/collapsed — only the
 *  labels reveal and the width slides. `RAIL_WIDTH` minus the `px-2` gutters. */
const ICON_COL = RAIL_WIDTH - 16;
const opacityTransition = {
  transitionDuration: '160ms',
  transitionProperty: 'opacity',
  transitionTimingFunction: 'ease',
} as const;

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface NavItem {
  label: string;
  href: string;
  icon: IoniconName;
}

// Outline icons only — the sidebar's active state is the tonal red squircle,
// never a heavy filled glyph (the solid variants read poorly when selected).
// The mobile bottom bar mirrors Android's wide stadium instead (see below).
// Diary uses `reader-outline` (a lined page), not `book-outline`: the open-book
// glyph is much wider and optically heavier than its home/search/settings
// siblings at size 22, and `journal-outline` collapsed into a featureless slab
// (owner call 2026-09-08). Native's tab bar keeps `book`/`book.fill` — this is a
// web-rail-only optical fix.
const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: routes.home, icon: 'home-outline' },
  { label: 'Diary', href: routes.diary, icon: 'reader-outline' },
  { label: 'Search', href: routes.search, icon: 'search-outline' },
  { label: 'Settings', href: routes.settings, icon: 'settings-outline' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === routes.home) return pathname === routes.home;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One press handler for both nav surfaces (mobile bar, sidebar). The search
 * destination also asks for the field: the tab's tap is the only user gesture
 * in the flow, and touch browsers only raise the keyboard on the back of one
 * — so the request rides along with the press. It lands live on a re-tap, or
 * holds pending until the screen mounts after a navigation (see
 * `features/search/focus-signal`). Every other destination navigates, or
 * no-ops on a re-press.
 */
function onNavItemPress(
  item: NavItem,
  active: boolean,
  pushRoute: (href: string) => void,
): void {
  if (!active) pushRoute(item.href);
  if (item.href === routes.search) emitSearchFocusRequest();
}

/**
 * Theme colors for the props that take a color *string* — an icon-font glyph,
 * the toggle's drawn strokes — rather than a class.
 *
 * `var(…)` rather than uniwind's `useCSSVariable`: react-native-web forwards a
 * `var()` color untouched (`modules/isWebColor`), so the browser resolves it
 * out of `global.css` exactly like a class does. Reading it in JS cannot work
 * on this surface — the web build is a static export, its prerender has no DOM
 * for `useCSSVariable` to read, so every glyph fell back to
 * `createIconSet`'s `'black'` default, that landed in the exported HTML, and
 * React never patches a hydrated element's inline style. The rail draws once
 * and never remounts, so it stayed black-on-black for the whole of a visitor's
 * first page. See docs/solutions/web-prerender-bakes-js-resolved-colors.md.
 */
const COLOR = {
  accentOnTonal: 'var(--color-accent-on-tonal)',
  foreground: 'var(--color-foreground)',
} as const;

/**
 * A label that fades as the sidebar collapses. It never shrinks (`flexShrink 0`)
 * so it slides out under the sidebar's `overflow-hidden` instead of ellipsing.
 * Below `md` it's `display: none`, not faded — the bottom bar carries its own
 * labels, and an invisible one would still hold its width in that row. `animate` is armed
 * only by a user toggle (see AppShell), so a reload with a persisted collapsed
 * pref paints shut instead of sliding shut.
 */
function RevealLabel({
  children,
  collapsed,
  animate,
  className,
}: {
  children: ReactNode;
  collapsed: boolean;
  animate: boolean;
  className: string;
}) {
  return (
    <Text
      className={cn('hidden md:flex', className)}
      numberOfLines={1}
      style={{
        flexShrink: 0,
        opacity: collapsed ? 0 : 1,
        ...(animate ? opacityTransition : null),
      }}
    >
      {children}
    </Text>
  );
}

/**
 * The sidebar control uses opposite divider positions to show which edge the
 * panel will move toward when pressed.
 */
function PanelIcon({
  color,
  collapsed,
  animate,
}: {
  color: string;
  collapsed: boolean;
  animate: boolean;
}) {
  return (
    <View
      style={{
        borderColor: color,
        borderRadius: 3.5,
        borderWidth: 1.75,
        height: 15,
        width: 18,
      }}
    >
      <View
        className={cn(
          animate &&
            'transition-transform duration-200 ease-in-out motion-reduce:transition-none',
        )}
        style={{
          backgroundColor: color,
          bottom: 0,
          left: 4,
          position: 'absolute',
          top: 0,
          transform: [{ translateX: collapsed ? 6 : 0 }],
          width: 1.75,
        }}
      />
    </View>
  );
}

/**
 * The collapse control sits in the sidebar footer in both states.
 */
function SidebarToggle({
  collapsed,
  animate,
  onToggle,
}: {
  collapsed: boolean;
  animate: boolean;
  onToggle: () => void;
}) {
  return (
    <PresstableOpacity
      accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      accessibilityRole="button"
      className="h-14 items-center justify-center"
      onPress={onToggle}
      style={{ width: ICON_COL }}
    >
      <PanelIcon color={COLOR.foreground} collapsed={collapsed} animate={animate} />
    </PresstableOpacity>
  );
}

function SidebarItem({
  item,
  active,
  collapsed,
  animate,
  onPress,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  animate: boolean;
  onPress: () => void;
}) {
  const color = active ? COLOR.accentOnTonal : COLOR.foreground;

  return (
    <PresstableOpacity
      accessibilityLabel={item.label}
      className={cn('h-11 flex-row items-center rounded-xl', active && 'bg-accent-tonal')}
      onPress={onPress}
    >
      <View className="items-center justify-center" style={{ width: ICON_COL }}>
        <Ionicons color={color} name={item.icon} size={22} />
      </View>
      <RevealLabel
        className="font-sans-semibold text-base text-foreground"
        collapsed={collapsed}
        animate={animate}
      >
        {item.label}
      </RevealLabel>
    </PresstableOpacity>
  );
}

/**
 * Persistent web navigation: at `md` and up a left rail (logo + destinations)
 * with the routed content filling the rest, matching plan.md Rule 103's
 * wide-screen left-panel split; below it the same nav lays itself out as a
 * bottom bar, the idiom a phone expects. Native has no sidebar — see `index.tsx`.
 *
 * The breakpoint is pure CSS (`md:` classes, i.e. real media queries in the
 * exported stylesheet — uniwind hands `className` straight to the DOM on web),
 * never `useWindowDimensions`: a JS branch measures nothing during the static
 * prerender, so the exported HTML would bake the desktop layout and snap to the
 * bar only after hydration.
 *
 * Collapse behavior is adapted from shadcn's `collapsible="icon"` sidebar: the
 * footer toggle (and ⌘/Ctrl+B) switches between the full rail and an icon-only
 * rail, persisted via `state/prefs/sidebar`. The width and labels animate
 * together (CSS transitions; web-only file). The toggle and the pref only exist
 * above `md` — the bottom bar has one shape.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const pushRoute = usePushRoute();
  const collapsed = useSidebarCollapsed();

  // The static prerender bakes the expanded rail while the collapsed pref
  // lives in localStorage, so the post-hydration sync to a stored collapsed
  // value lands one commit after the hydrated paint. Transitions arm only on
  // a user toggle — never on mount — so that boot sync snaps shut instead of
  // visibly sliding shut on every reload, while presses still animate. (A
  // mount flag can't do this: the sync update batches with the mount effect's
  // own update, re-arming transitions in the collapsing commit.)
  const [animated, setAnimated] = useState(false);
  function userToggleSidebar(): void {
    setAnimated(true);
    toggleSidebarCollapsed();
  }

  // ⌘/Ctrl+B toggles the sidebar — the shadcn keyboard shortcut. Below `md`
  // the pref still flips; it just has nothing to widen until the viewport does.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'b' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        userToggleSidebar();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // ⌘/Ctrl+K jumps to search from anywhere. The modifier is the whole guard —
  // a bare "k" typed into any field must never be hijacked. Already on search?
  // Navigating again wouldn't re-mount the field (so `autoFocus` wouldn't
  // fire); the focus signal covers that case instead.
  const onSearch = isActive(pathname, routes.search);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (onSearch) emitSearchFocusRequest();
      // push-guard-exempt: a ⌘K keypress, not a press — and it already can't
      // repeat, since a second ⌘K on /search takes the focus branch above.
      else router.push(routes.search);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onSearch, router]);

  return (
    // `flex-col-reverse` puts the nav (first child) below the content on a
    // phone and `md:flex-row` puts it back on the left; the bar is a flex
    // sibling, not an overlay, so nothing needs bottom padding to clear it.
    <View className="flex-1 flex-col-reverse md:flex-row">
      <View
        className={cn(
          'border-t border-border bg-background overflow-hidden md:px-2',
          // oxlint-disable-next-line shadcn/no-arbitrary-values -- the home indicator's inset has no scale value
          'pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3',
          'md:h-full md:w-60 md:border-t-0 md:border-r md:pt-6 md:pb-0 md:flex-col',
          // The bar is stretched, not `w-full`: `auto` can't interpolate, so
          // crossing `md` snaps. From `100%` it slid down to 240px, squeezing
          // the page to ~0px wide and latching Legend List's width
          // (docs/solutions/web-breakpoint-cross-blanks-list.md).
          // Unarmed until a user toggle (see above): the boot sync to a
          // stored collapsed pref must snap, not slide.
          // oxlint-disable-next-line shadcn/no-arbitrary-values -- Tailwind has no width-only transition
          animated && 'md:transition-[width] md:duration-220',
          collapsed && 'md:w-16',
        )}
      >
        <PresstableOpacity
          accessibilityLabel="Home"
          className="hidden md:flex h-10 mb-6 flex-row items-center"
          onPress={() => {
            if (!isActive(pathname, routes.home)) router.replace(routes.home);
          }}
        >
          <View className="items-center justify-center" style={{ width: ICON_COL }}>
            <Text className="text-2xl font-display text-foreground">忍</Text>
          </View>
          <RevealLabel
            className="text-2xl font-display text-foreground tracking-tight"
            collapsed={collapsed}
            animate={animated}
          >
            Shinobu
          </RevealLabel>
        </PresstableOpacity>
        <View className="flex-row md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <PresstableOpacity
                accessibilityLabel={item.label}
                accessibilityRole="button"
                className="flex-1 items-center justify-center gap-1"
                key={item.href}
                onPress={() => onNavItemPress(item, active, pushRoute)}
              >
                {/* Mirrors the native Android bar (`(tabs)/_layout.tsx`): a wide
                    tonal stadium behind the glyph with the label below, labels
                    always in the foreground colour. */}
                <View
                  className={cn(
                    'h-8 w-16 items-center justify-center rounded-full',
                    active && 'bg-accent-tonal',
                  )}
                >
                  <Ionicons
                    color={active ? COLOR.accentOnTonal : COLOR.foreground}
                    name={item.icon}
                    size={23}
                  />
                </View>
                <Text className="text-xs font-sans text-foreground">{item.label}</Text>
              </PresstableOpacity>
            );
          })}
        </View>
        <View className="hidden md:flex md:flex-col md:gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <SidebarItem
                active={active}
                collapsed={collapsed}
                animate={animated}
                item={item}
                key={item.href}
                // Pressing the tab you're on pushes nothing (the tabs Navigator
                // is a stack, so pushing the same href again would stack a
                // second copy of the page and replay its enter fade over
                // itself) — search still asks for the field (see
                // `onNavItemPress`).
                onPress={() => onNavItemPress(item, active, pushRoute)}
              />
            );
          })}
        </View>
        <View className="hidden md:flex mt-auto border-t border-border">
          <SidebarToggle
            collapsed={collapsed}
            animate={animated}
            onToggle={userToggleSidebar}
          />
        </View>
      </View>
      <View className="flex-1">{children}</View>
    </View>
  );
}
