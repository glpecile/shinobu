import Ionicons from '@react-native-vector-icons/ionicons/static';
import { usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { RoundIconButton } from '@/components/round-icon-button';
import { cn } from '@/lib/cn';
import { emitSearchFocusRequest } from '@/features/search/focus-signal';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import {
  toggleSidebarCollapsed,
  useSidebarCollapsed,
} from '@/state/prefs/sidebar';

/**
 * Sidebar widths (px). Their classes (`md:w-60` / `md:w-16`) are the values the
 * browser actually paints — these mirror them for the toggle's `left`.
 */
const SIDEBAR_WIDTH = 240;
const RAIL_WIDTH = 64;
/** Fixed icon column so icons never shift between expanded/collapsed — only the
 *  labels reveal and the width slides. `RAIL_WIDTH` minus the `px-2` gutters. */
const ICON_COL = RAIL_WIDTH - 16;
/** Diameter of `RoundIconButton` (w-10). */
const TOGGLE_SIZE = 40;

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const leftTransition = {
  transitionDuration: '220ms',
  transitionProperty: 'left',
  transitionTimingFunction: EASE,
} as const;
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

// Outline icons only — active state is the tonal red pill, never a heavy
// filled glyph (the solid variants read poorly when selected).
// Diary uses `reader-outline` (a lined page), not `book-outline`: the open-book
// glyph is much wider and optically heavier than its home/search/settings
// siblings at size 22, and `journal-outline` collapsed into a featureless slab
// (owner call 2026-09-08). Native's tab bar keeps `book`/`book.fill` — this is a
// web-rail-only optical fix.
const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: routes.home, icon: 'home-outline' },
  { label: 'Diary', href: routes.diary, icon: 'reader-outline' },
  { label: 'Search', href: routes.search, icon: 'search-outline' },
  { label: 'Settings', href: routes.connect, icon: 'settings-outline' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === routes.home) return pathname === routes.home;
  return pathname === href || pathname.startsWith(`${href}/`);
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
 * Below `md` it's `display: none`, not faded — the bottom bar is icons only, and
 * an invisible label would still hold its width in that row.
 */
function RevealLabel({
  children,
  collapsed,
  className,
}: {
  children: ReactNode;
  collapsed: boolean;
  className: string;
}) {
  return (
    <Text
      className={cn('hidden md:flex', className)}
      numberOfLines={1}
      style={{ flexShrink: 0, opacity: collapsed ? 0 : 1, ...opacityTransition }}
    >
      {children}
    </Text>
  );
}

/**
 * The lucide/shadcn "panel-left" glyph, composed from Views (no SVG/icon-font
 * dependency): a rounded rect with a vertical divider a third of the way in.
 */
function PanelLeftIcon({ color }: { color: string }) {
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
        style={{
          backgroundColor: color,
          bottom: 0,
          left: 4,
          position: 'absolute',
          top: 0,
          width: 1.75,
        }}
      />
    </View>
  );
}

/**
 * The collapse toggle floating at the bottom of the sidebar's right edge. Its
 * `left` slides in sync with the sidebar width.
 */
function SidebarToggle({ collapsed }: { collapsed: boolean }) {
  const edge = collapsed ? RAIL_WIDTH : SIDEBAR_WIDTH;

  return (
    <RoundIconButton
      className="hidden md:flex absolute z-30"
      icon={<PanelLeftIcon color={COLOR.foreground} />}
      label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      onPress={toggleSidebarCollapsed}
      style={{ bottom: 18, left: edge - TOGGLE_SIZE / 2, ...leftTransition }}
    />
  );
}

function SidebarItem({
  item,
  active,
  collapsed,
  onPress,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onPress: () => void;
}) {
  const color = active ? COLOR.accentOnTonal : COLOR.foreground;

  return (
    <PresstableOpacity
      accessibilityLabel={item.label}
      className={cn('h-11 flex-row items-center rounded-full', active && 'bg-accent-tonal')}
      onPress={onPress}
    >
      <View className="items-center justify-center" style={{ width: ICON_COL }}>
        <Ionicons color={color} name={item.icon} size={22} />
      </View>
      <RevealLabel
        className="font-sans-semibold text-base text-foreground"
        collapsed={collapsed}
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
 * floating edge toggle (and ⌘/Ctrl+B) switches between the full rail and an
 * icon-only rail, persisted via `state/prefs/sidebar`. The width, labels, and
 * toggle animate together (CSS transitions; web-only file). The toggle and the
 * pref only exist above `md` — the bottom bar has one shape.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const pushRoute = usePushRoute();
  const collapsed = useSidebarCollapsed();

  // ⌘/Ctrl+B toggles the sidebar — the shadcn keyboard shortcut. Below `md`
  // the pref still flips; it just has nothing to widen until the viewport does.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'b' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebarCollapsed();
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
          'border-t border-border bg-background overflow-hidden px-2',
          // oxlint-disable-next-line shadcn/no-arbitrary-values -- the home indicator's inset has no scale value
          'pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2',
          'md:h-full md:w-60 md:border-t-0 md:border-r md:pt-6 md:pb-0',
          // The bar is stretched, not `w-full`: `auto` can't interpolate, so
          // crossing `md` snaps. From `100%` it slid down to 240px, squeezing
          // the page to ~0px wide and latching Legend List's width
          // (docs/solutions/web-breakpoint-cross-blanks-list.md).
          // oxlint-disable-next-line shadcn/no-arbitrary-values -- Tailwind has no width-only transition
          'md:transition-[width] md:duration-220',
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
          >
            Shinobu
          </RevealLabel>
        </PresstableOpacity>
        <View className="flex-row justify-around md:flex-col md:gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <SidebarItem
                active={active}
                collapsed={collapsed}
                item={item}
                key={item.href}
                // Pressing the tab you're on is a no-op: the tabs Navigator is
                // a stack, so pushing the same href again would stack a second
                // copy of the page and replay its enter fade over itself.
                onPress={() => {
                  if (!active) pushRoute(item.href);
                }}
              />
            );
          })}
        </View>
      </View>
      <View className="flex-1">{children}</View>
      {/* Last child so it paints above the routed content it overlaps. */}
      <SidebarToggle collapsed={collapsed} />
    </View>
  );
}
