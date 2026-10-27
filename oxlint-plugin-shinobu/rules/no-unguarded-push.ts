import { defineRule, type ESTree } from '@oxlint/plugins';

import { isCallTo, nodeName } from '../utils.ts';

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Push app routes through usePushRoute() to prevent duplicate navigation.' },
    schema: [],
  },
  create(context) {
    if (context.filename.replaceAll('\\', '/').includes('/src/lib/navigation/')) return {};
    const routers = new Set(['router']);
    const hooks = new Set(['useRouter']);
    const pushes = new Set<string>();
    const isRouter = (node: ESTree.Node | null | undefined) => routers.has(nodeName(node) ?? '') || isCallTo(node, hooks);

    function exempted(node: ESTree.Node): boolean {
      // Exemptions may sit above the enclosing if or callback, with a wrapped reason.
      const lines = context.sourceCode.lines;
      for (let line = node.loc.start.line - 2; line >= 0; line--) {
        const text = lines[line] ?? '';
        if (!/^\s*(\/\/|\*|\/\*)/.test(text)) return false;
        if (/\/\/\s*push-guard-exempt:\s*\S/.test(text)) return true;
      }
      return false;
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'expo-router') return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          switch (nodeName(specifier.imported)) {
            case 'router': routers.add(specifier.local.name); break;
            case 'useRouter': hooks.add(specifier.local.name); break;
          }
        }
      },
      VariableDeclarator(node) {
        if (!isRouter(node.init)) return;
        if (node.id.type === 'Identifier') routers.add(node.id.name);
        if (node.id.type === 'ObjectPattern') {
          for (const property of node.id.properties) {
            if (property.type === 'Property' && ['push', 'navigate'].includes(nodeName(property.key) ?? '') && property.value.type === 'Identifier') pushes.add(property.value.name);
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        const unguarded = callee.type === 'Identifier' ? pushes.has(callee.name) :
          callee.type === 'MemberExpression' && isRouter(callee.object) && ['push', 'navigate'].includes(nodeName(callee.property) ?? '');
        if (unguarded && !exempted(node)) {
          context.report({ node, message: 'Use usePushRoute() from @/lib/navigation to prevent duplicate pushes. Non-press navigation needs a push-guard-exempt: <reason> comment above the call.' });
        }
      },
    };
  },
});
