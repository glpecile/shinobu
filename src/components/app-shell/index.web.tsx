import Ionicons from '@react-native-vector-icons/ionicons/static';
import { usePathname, useRouter } from 'expo-router';
import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { emitSearchFocusRequest } from '@/features/search/focus-signal';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { toggleSidebarCollapsed, useSidebarCollapsed } from '@/state/prefs/sidebar';

const RAIL_WIDTH = 64;
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

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: routes.home, icon: 'home-outline' },
  { label: 'Diary', href: routes.diary, icon: 'reader-outline' },
  { label: 'Settings', href: routes.settings, icon: 'settings-outline' },
  { label: 'Search', href: routes.search, icon: 'search-outline' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === routes.home) return pathname === routes.home;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Touch browsers only raise the keyboard inside a user gesture, so search
 * navigation commits synchronously (`flushSync`) before requesting focus.
 */
function onNavItemPress(item: NavItem, active: boolean, pushRoute: (href: string) => void): void {
  if (item.href === routes.search) {
    if (!active) flushSync(() => pushRoute(item.href));
    emitSearchFocusRequest();
    return;
  }
  if (!active) pushRoute(item.href);
}

function preventMouseFocus(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
}

/**
 * `var()` rather than `useCSSVariable`: static web prerender has no DOM, so
 * JS-resolved colors bake fallback values into exported HTML that hydration
 * never patches (docs/solutions/web-prerender-bakes-js-resolved-colors.md).
 */
const COLOR = {
  accentOnTonal: 'var(--color-accent-on-tonal)',
  foreground: 'var(--color-foreground)',
} as const;

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
          animate && 'transition-transform duration-200 ease-in-out motion-reduce:transition-none',
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
      accessibilityState={{ expanded: !collapsed }}
      aria-expanded={!collapsed}
      className="h-14 items-center justify-center"
      onPress={onToggle}
      pressBehavior="immediate"
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
      onMouseDown={item.href === routes.search ? preventMouseFocus : undefined}
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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const pushRoute = usePushRoute();
  const collapsed = useSidebarCollapsed();

  // Transitions arm only on user toggle so the post-hydration sync to a stored collapsed pref snaps instead of sliding.
  const [animated, setAnimated] = useState(false);
  function userToggleSidebar(animate = true): void {
    setAnimated(animate);
    toggleSidebarCollapsed();
  }

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'b' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        userToggleSidebar(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const onSearch = isActive(pathname, routes.search);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      // push-guard-exempt: a ⌘K keypress, not a press.
      if (!onSearch) flushSync(() => router.push(routes.search));
      emitSearchFocusRequest();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onSearch, router]);

  return (
    <View className="flex-1 flex-col-reverse md:flex-row">
      <View
        className={cn(
          'border-t border-border bg-background overflow-hidden md:px-2',
          // oxlint-disable-next-line shadcn/no-arbitrary-values -- the home indicator's inset has no scale value
          'pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3',
          'md:h-full md:w-60 md:border-t-0 md:border-r md:pt-6 md:pb-0 md:flex-col',
          // Keep width `auto` below `md` (never `w-full`) so crossing `md` snaps instead
          // of transitioning and latching Legend List's width (docs/solutions/web-breakpoint-cross-blanks-list.md).
          // oxlint-disable-next-line shadcn/no-arbitrary-values -- Tailwind has no width-only transition
          animated && 'md:transition-[width] md:duration-220 md:motion-reduce:transition-none',
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
                onMouseDown={item.href === routes.search ? preventMouseFocus : undefined}
                onPress={() => onNavItemPress(item, active, pushRoute)}
              >
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
                onPress={() => onNavItemPress(item, active, pushRoute)}
              />
            );
          })}
        </View>
        <View className="hidden md:flex mt-auto border-t border-border">
          <SidebarToggle collapsed={collapsed} animate={animated} onToggle={userToggleSidebar} />
        </View>
      </View>
      <View className="flex-1 overflow-hidden">{children}</View>
    </View>
  );
}
