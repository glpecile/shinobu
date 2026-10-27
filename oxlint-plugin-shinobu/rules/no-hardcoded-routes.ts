import { defineRule, type ESTree, type Scope } from '@oxlint/plugins';

import { isCallTo, nodeName } from '../utils.ts';

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Keep app destinations in src/lib/routes.ts.' },
    schema: [],
  },
  create(context) {
    if (context.filename.endsWith('/src/lib/routes.ts') || /\.test\.tsx?$/.test(context.filename)) return {};

    const routers = new Set(['router']);
    const routerHooks = new Set(['useRouter']);
    const pushes = new Set(['pushRoute']);
    const pushHooks = new Set(['usePushRoute']);

    function check(node: ESTree.Node | null | undefined, seen = new Set<ESTree.Node>()) {
      if (node == null || seen.has(node)) return;
      seen.add(node);
      switch (node?.type) {
        case 'Literal':
          if (typeof node.value !== 'string' || /^(?!shinobu:)[a-z][a-z0-9+.-]*:|^\/\//i.test(node.value)) return;
          break;
        case 'TemplateLiteral':
          if (/^(?!shinobu:)[a-z][a-z0-9+.-]*:|^\/\//i.test(node.quasis[0].value.raw)) return;
          break;
        case 'Identifier': {
          let scope: Scope | null = context.sourceCode.getScope(node);
          while (scope != null) {
            const variable = scope.variables.find((entry) => entry.name === node.name);
            if (variable != null) {
              const definition = variable.defs[0]?.node;
              return check(definition?.type === 'VariableDeclarator' ? definition.init : undefined, seen);
            }
            scope = scope.upper;
          }
          return;
        }
        case 'JSXExpressionContainer':
        case 'TSAsExpression':
        case 'TSSatisfiesExpression':
        case 'TSNonNullExpression':
        case 'ChainExpression':
          return check(node.expression, seen);
        case 'ConditionalExpression':
          check(node.consequent, seen);
          return check(node.alternate, seen);
        case 'LogicalExpression':
        case 'BinaryExpression':
          check(node.left, seen);
          return check(node.right, seen);
        default:
          return;
      }
      context.report({ node, message: 'Define app destinations in src/lib/routes.ts and use routes.*, not inline route strings.' });
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'expo-router' && node.source.value !== '@/lib/navigation') return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const imported = nodeName(specifier.imported);
          switch (imported) {
            case 'router': routers.add(specifier.local.name); break;
            case 'useRouter': routerHooks.add(specifier.local.name); break;
            case 'usePushRoute': pushHooks.add(specifier.local.name); break;
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === 'Identifier' && pushes.has(callee.name)) check(node.arguments[0]);
        if (callee.type === 'MemberExpression' &&
          (routers.has(nodeName(callee.object) ?? '') || isCallTo(callee.object, routerHooks)) &&
          ['push', 'replace', 'navigate', 'dismissTo', 'prefetch'].includes(nodeName(callee.property) ?? '')) check(node.arguments[0]);
      },
      JSXAttribute(node) {
        if (node.name.name === 'href') check(node.value);
      },
      Property(node) {
        if (['href', 'pathname'].includes(nodeName(node.key) ?? '')) check(node.value);
      },
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier') {
          if (routers.has(nodeName(node.init) ?? '') || isCallTo(node.init, routerHooks)) routers.add(node.id.name);
          if (pushes.has(nodeName(node.init) ?? '') || isCallTo(node.init, pushHooks)) pushes.add(node.id.name);
        }
        if (node.id.type === 'ObjectPattern' && (routers.has(nodeName(node.init) ?? '') || isCallTo(node.init, routerHooks))) {
          for (const property of node.id.properties) {
            if (property.type === 'Property' && ['push', 'replace', 'navigate', 'dismissTo', 'prefetch'].includes(nodeName(property.key) ?? '') && property.value?.type === 'Identifier') pushes.add(property.value.name);
          }
        }
        if (node.id.type === 'Identifier' && /(?:href|route)$/i.test(node.id.name)) check(node.init);
      },
    };
  },
});
