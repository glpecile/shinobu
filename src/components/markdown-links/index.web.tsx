import type { ReactNode } from 'react';

import { httpUrl } from './http-url';

/** Enriched inserts anchors asynchronously; neutralize them before the next input event. */
function guardLinks(element: HTMLDivElement | null) {
  if (element == null) return;

  const sanitize = () => {
    for (const link of element.querySelectorAll('a[href]')) {
      if (httpUrl(link.getAttribute('href') ?? '') == null) link.removeAttribute('href');
    }
  };

  sanitize();
  const observer = new MutationObserver(sanitize);
  observer.observe(element, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  });
  return () => observer.disconnect();
}

/** A press callback alone cannot guard browser context menus or middle clicks. */
export function MarkdownLinks({ children }: { children: ReactNode }) {
  return <div ref={guardLinks}>{children}</div>;
}
