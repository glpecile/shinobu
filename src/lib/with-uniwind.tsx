import type { JSXElementConstructor } from 'react';
// oxlint-disable-next-line no-restricted-imports -- this *is* the wrapper the rule points at.
import { withUniwind as uniwind } from 'uniwind';

/** uniwind's `withUniwind`, minus its web crash on an undefined `*ClassName` (docs/solutions/uniwind-classname-undefined-throws.md). */
export function withUniwind<T extends JSXElementConstructor<any>>(Component: T) {
  const Styled = uniwind(Component);
  return (props: Parameters<typeof Styled>[0]) => {
    const defined = Object.fromEntries(
      Object.entries(props).filter(
        ([name, value]) => value !== undefined || !/className$/i.test(name),
      ),
    ) as typeof props;
    return <Styled {...defined} />;
  };
}
