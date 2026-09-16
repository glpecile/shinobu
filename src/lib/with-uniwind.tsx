import type { JSXElementConstructor } from 'react';
// oxlint-disable-next-line no-restricted-imports -- this *is* the wrapper the rule points at.
import { withUniwind as uniwind } from 'uniwind';

/**
 * uniwind's `withUniwind`, minus its web crash on an omitted class prop: it hands
 * `className={undefined}` to styleq as `tailwind: undefined`, which throws
 * (docs/solutions/uniwind-classname-undefined-throws.md). Dropping undefined
 * `*ClassName` props first makes forwarding an optional prop safe.
 */
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
