import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { expect, test } from 'bun:test';
import { createElement } from 'react';

GlobalRegistrator.register();
const { render, waitFor } = await import('@testing-library/react');
const { MarkdownLinks } = await import('./index.web');

function anchors() {
  return [
    createElement('a', { key: 'safe', href: 'https://example.com' }, 'Website'),
    createElement('a', { key: 'scheme', href: 'mailto:review@example.com' }, 'Email'),
    createElement('a', { key: 'relative', href: 'relative-target' }, 'Relative'),
  ];
}

test('unsupported Markdown destinations never remain browser links, including after asynchronous rendering', async () => {
  const view = render(createElement(MarkdownLinks, { children: anchors() }));
  try {
    expect(view.getByText('Website').getAttribute('href')).toBe('https://example.com');
    expect(view.getByText('Email').hasAttribute('href')).toBe(false);
    expect(view.getByText('Relative').hasAttribute('href')).toBe(false);

    view.rerender(createElement(MarkdownLinks, { children: null }));
    view.rerender(createElement(MarkdownLinks, { children: anchors() }));
    await waitFor(() => expect(view.getByText('Email').hasAttribute('href')).toBe(false));
    expect(view.getByText('Website').getAttribute('href')).toBe('https://example.com');

    view.getByText('Website').setAttribute('href', 'tel:+123');
    await waitFor(() => expect(view.getByText('Website').hasAttribute('href')).toBe(false));
  } finally {
    view.unmount();
  }
});
