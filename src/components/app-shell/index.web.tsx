import Ionicons from '@react-native-vector-icons/ionicons/static';
import { usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { emitSearchFocusRequest } from '@/features/search/focus-signal';
import { routes } from '@/lib/routes';
import {
  toggleSidebarCollapsed,
  useSidebarCollapsed,
} from '@/state/prefs/sidebar';

/** Below this width labels never fit, so the rail is forced regardless of pref. */
const RAIL_BREAKPOINT = 768;

/** Sidebar widths (px). */
const SIDEBAR_WIDTH = 240;
const RAIL_WIDTH = 64;
/** Fixed icon column so icons never shift between expanded/collapsed — only the
 *  labels reveal and the width slides. `RAIL_WIDTH` minus the `px-2` gutters. */
const ICON_COL = RAIL_WIDTH - 16;
/** Diameter of the floating edge toggle — matches FloatingBackButton (w-10). */
const TOGGLE_SIZE = 40;

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const widthTransition = {
  transitionDuration: '220ms',
  transitionProperty: 'width',
  transitionTimingFunction: EASE,
} as const;
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

// Outline icons only — active state is the accent colour + pill, never a heavy
// filled glyph (the solid variants read poorly when selected).
// Diary uses `journal-outline` (a closed notebook), not `book-outline`: the
// open-book glyph is much wider and optically heavier than its home/search/
// settings siblings at size 22, which made the rail look uneven. Native's tab
// bar keeps `book`/`book.fill` — this is a web-rail-only optical fix.
const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: routes.home, icon: 'home-outline' },
  { label: 'Diary', href: routes.diary, icon: 'journal-outline' },
  { label: 'Search', href: routes.search, icon: 'search-outline' },
  { label: 'Settings', href: routes.connect, icon: 'settings-outline' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === routes.home) return pathname === routes.home;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useCssColor(variable: string): string | undefined {
  const value = useCSSVariable(variable);
  return typeof value === 'string' ? value : undefined;
}

/**
 * A label that fades as the sidebar collapses. It never shrinks (`flexShrink 0`)
 * so it slides out under the sidebar's `overflow-hidden` instead of ellipsing.
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
      className={className}
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
function PanelLeftIcon({ color }: { color: string | undefined }) {
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
 * The collapse toggle: a round button floating at the bottom of the sidebar's
 * right edge — same treatment as `FloatingBackButton` (round, bg-surface/90,
 * bordered) so it reads as one design language with the detail screens' back
 * button. Its `left` slides in sync with the sidebar width.
 */
function SidebarToggle({ collapsed }: { collapsed: boolean }) {
  const foreground = useCssColor('--color-foreground');
  const edge = collapsed ? RAIL_WIDTH : SIDEBAR_WIDTH;

  return (
    <PresstableOpacity
      accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className="absolute z-30 w-10 h-10 rounded-full bg-surface/90 border border-border items-center justify-center"
      style={{ bottom: 18, left: edge - TOGGLE_SIZE / 2, ...leftTransition }}
      onPress={toggleSidebarCollapsed}
    >
      <PanelLeftIcon color={foreground} />
    </PresstableOpacity>
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
  const foreground = useCssColor('--color-foreground');
  const accent = useCssColor('--color-accent');
  const muted = useCssColor('--color-muted');
  const color = active ? accent : muted ?? foreground;

  return (
    <PresstableOpacity
      accessibilityLabel={item.label}
      className={cn('h-11 flex-row items-center rounded-lg', active && 'bg-surface')}
      onPress={onPress}
    >
      <View className="items-center justify-center" style={{ width: ICON_COL }}>
        <Ionicons color={color} name={item.icon} size={22} />
      </View>
      <RevealLabel
        className={cn(
          'font-sans-semibold text-base',
          active ? 'text-accent' : 'text-foreground',
        )}
        collapsed={collapsed}
      >
        {item.label}
      </RevealLabel>
    </PresstableOpacity>
  );
}

/**
 * Persistent desktop navigation: a left rail (logo + destinations) with the
 * routed content filling the rest. Matches plan.md Rule 103's wide-screen
 * left-panel split. Native has no sidebar — see `index.tsx`.
 *
 * Collapse behavior is adapted from shadcn's `collapsible="icon"` sidebar: the
 * floating edge toggle (and ⌘/Ctrl+B) switches between the full rail and an
 * icon-only rail, persisted via `state/prefs/sidebar`. The width, labels, and
 * toggle animate together (CSS transitions; web-only file). Below
 * `RAIL_BREAKPOINT` the rail is forced (labels can't fit) and the toggle hides.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const forced = width < RAIL_BREAKPOINT;
  const userCollapsed = useSidebarCollapsed();
  const collapsed = forced || userCollapsed;

  // ⌘/Ctrl+B toggles the sidebar — the shadcn keyboard shortcut. Inert while
  // forced (the stored pref still flips and applies once the window widens).
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
      else router.push(routes.search);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onSearch, router]);

  return (
    <View className="flex-1 flex-row">
      <View
        className="h-full border-r border-border bg-background overflow-hidden px-2 pt-6"
        style={{ width: collapsed ? RAIL_WIDTH : SIDEBAR_WIDTH, ...widthTransition }}
      >
        <PresstableOpacity
          accessibilityLabel="Home"
          className="h-10 mb-6 flex-row items-center"
          onPress={() => router.replace(routes.home)}
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
        <View className="gap-1">
          {NAV_ITEMS.map((item) => (
            <SidebarItem
              active={isActive(pathname, item.href)}
              collapsed={collapsed}
              item={item}
              key={item.href}
              onPress={() => router.push(item.href)}
            />
          ))}
        </View>
      </View>
      <View className="flex-1">{children}</View>
      {/* Last child so it paints above the routed content it overlaps. */}
      {!forced && <SidebarToggle collapsed={collapsed} />}
    </View>
  );
}
