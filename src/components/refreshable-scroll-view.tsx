import type { Ref } from 'react';
import type { ScrollViewInstance, ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GestureScrollView } from '@/components/animated-view';
import { RefreshControl } from '@/components/refresh-control';

interface RefreshableScrollViewProps extends ScrollViewProps {
  ref?: Ref<ScrollViewInstance>;
  onRefresh: () => Promise<unknown>;
  /** Android-only: offsets the pull gap below the status bar for full-bleed screens (ignored on iOS). */
  spinnerBelowStatusBar?: boolean;
  /** Tab route name; double-tapping it triggers `onRefresh`. */
  tab?: string;
}

export function RefreshableScrollView({
  onRefresh,
  spinnerBelowStatusBar,
  tab,
  children,
  ...rest
}: RefreshableScrollViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <GestureScrollView
      {...rest}
      refreshControl={
        <RefreshControl
          onRefresh={onRefresh}
          progressViewOffset={
            spinnerBelowStatusBar === true ? insets.top : undefined
          }
          tab={tab}
        />
      }
    >
      {children}
    </GestureScrollView>
  );
}
