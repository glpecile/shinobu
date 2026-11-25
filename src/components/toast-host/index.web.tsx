import type { CSSProperties } from 'react';
import { Toaster } from 'sonner';
import { useUniwind } from 'uniwind';

import { CSS_EASE_OUT, DURATION } from '@/lib/motion';

import './toast-motion.css';

export function ToastHost() {
  const { theme } = useUniwind();
  return (
    <Toaster
      expand
      offset={{ bottom: 'var(--toast-bottom, 32px)' }}
      mobileOffset={{ bottom: 'var(--toast-bottom, 32px)' }}
      position="bottom-right"
      theme={theme}
      style={{
        '--toast-enter': `${DURATION.enter}ms`,
        '--toast-exit': `${DURATION.exit}ms`,
        '--toast-ease': CSS_EASE_OUT,
      } as CSSProperties}
    />
  );
}
