import type { ESTree } from '@oxlint/plugins';

export function nodeName(node: ESTree.Node | null | undefined): string | undefined {
  if (node?.type === 'Identifier' || node?.type === 'JSXIdentifier') return node.name;
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  return undefined;
}

export function isCallTo(node: ESTree.Node | null | undefined, names: Set<string>): boolean {
  return node?.type === 'CallExpression' && names.has(nodeName(node.callee) ?? '');
}
