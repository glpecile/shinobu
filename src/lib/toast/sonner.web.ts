import { createElement } from 'react';
import { toast } from 'sonner';

import { ToastCard, type ToastKind } from '@/components/toast-card';

/** Web Sonner owns positioning and swipe dismissal around the shared card. */
export function showToast(
  kind: ToastKind,
  title: string,
  message: string | undefined,
  duration: number,
) {
  toast.custom(() => createElement(ToastCard, { kind, title, message }), {
    duration,
    style: { width: '100%' },
  });
}
