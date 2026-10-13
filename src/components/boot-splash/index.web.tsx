import { CSS_EASE_OUT } from '@/lib/motion';

/** Release the static overlay only after React's startup gate opens. */
export function dismissBootSplash() {
  const node = document.getElementById('boot-loader');
  if (!node || node.dataset.dismissing) return;
  node.dataset.dismissing = 'true';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const options = {
    duration: reduced ? 120 : 300,
    easing: CSS_EASE_OUT,
    fill: 'forwards' as const,
  };
  node.animate([{ opacity: 1 }, { opacity: 0 }], options).onfinish = () => node.remove();
  if (!reduced) {
    node.querySelector('[data-boot-mark]')?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.5)' }],
      options,
    );
  }
}

// The web splash is in +html.tsx so it paints before JavaScript or fonts load.
export function BootSplash() {
  return null;
}
