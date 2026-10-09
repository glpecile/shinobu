export default {
  meta: { name: 'shinobu' },
  rules: {
    'no-hardcoded-routes': {
      meta: { schema: [] },
      create(context) {
        if (context.filename.endsWith('/src/lib/routes.ts') || /\.test\.tsx?$/.test(context.filename)) return {};

        const routers = new Set(['router']);
        const routerHooks = new Set(['useRouter']);
        const pushes = new Set(['pushRoute']);
        const pushHooks = new Set(['usePushRoute']);

        function check(node, seen = new Set()) {
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
              let scope = context.sourceCode.getScope(node);
              while (scope != null) {
                const variable = scope.variables.find((entry) => entry.name === node.name);
                if (variable != null) return check(variable.defs[0]?.node.init, seen);
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
              const imported = specifier.imported?.name ?? specifier.imported?.value;
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
              (routers.has(callee.object.name) || (callee.object.type === 'CallExpression' && routerHooks.has(callee.object.callee.name))) &&
              ['push', 'replace', 'navigate', 'dismissTo', 'prefetch'].includes(callee.computed ? callee.property.value : callee.property.name)) check(node.arguments[0]);
          },
          JSXAttribute(node) {
            if (node.name.name === 'href') check(node.value);
          },
          Property(node) {
            if (['href', 'pathname'].includes(node.key.name ?? node.key.value)) check(node.value);
          },
          VariableDeclarator(node) {
            if (node.id.type === 'Identifier') {
              if (routers.has(node.init?.name) || (node.init?.type === 'CallExpression' && routerHooks.has(node.init.callee.name))) routers.add(node.id.name);
              if (pushes.has(node.init?.name) || (node.init?.type === 'CallExpression' && pushHooks.has(node.init.callee.name))) pushes.add(node.id.name);
            }
            if (node.id.type === 'ObjectPattern' && (routers.has(node.init?.name) || (node.init?.type === 'CallExpression' && routerHooks.has(node.init.callee.name)))) {
              for (const property of node.id.properties) {
                if (['push', 'replace', 'navigate', 'dismissTo', 'prefetch'].includes(property.key?.name ?? property.key?.value) && property.value?.type === 'Identifier') pushes.add(property.value.name);
              }
            }
            if (node.id.type === 'Identifier' && /(?:href|route)$/i.test(node.id.name)) check(node.init);
          },
        };
      },
    },
    'no-pointer-events-prop': {
      meta: { schema: [] },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name.name === 'pointerEvents') {
              context.report({
                node,
                message: 'Use style.pointerEvents instead; the pointerEvents prop is deprecated on React Native Web.',
              });
            }
          },
        };
      },
    },
  },
};
