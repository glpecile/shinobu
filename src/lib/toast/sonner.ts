import { createElement } from 'react';
import { View } from 'react-native';
import { toast } from 'sonner-native';

import { ToastCard, type ToastKind } from '@/components/toast-card';

/** Native Sonner owns gestures and overlays around the shared card. */
export function showToast(
  kind: ToastKind,
  title: string,
  message: string | undefined,
  duration: number,
) {
  // Custom JSX bypasses the native host's toast styles, including its gutters.
  toast.custom(
    createElement(
      View,
      { style: { marginHorizontal: 16 } },
      createElement(ToastCard, { kind, title, message }),
    ),
    { duration },
  );
}
