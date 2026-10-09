export default {
  meta: { name: 'shinobu' },
  rules: {
    'no-hardcoded-routes': {
      meta: { schema: [] },
      create(context) {
        if (context.filename.endsWith('/src/lib/routes.ts') || /\.test\.tsx?$/.test(context.filename)) return {};

        function check(node) {
          switch (node?.type) {
            case 'Literal':
              if (typeof node.value !== 'string' || !/^\/(?!\/)/.test(node.value)) return;
              break;
            case 'TemplateLiteral':
              if (!/^\/(?!\/)/.test(node.quasis[0].value.raw)) return;
              break;
            case 'JSXExpressionContainer':
            case 'TSAsExpression':
            case 'TSSatisfiesExpression':
              return check(node.expression);
            case 'ConditionalExpression':
              check(node.consequent);
              return check(node.alternate);
            case 'LogicalExpression':
            case 'BinaryExpression':
              check(node.left);
              return check(node.right);
            default:
              return;
          }
          context.report({ node, message: 'Define app destinations in src/lib/routes.ts and use routes.*, not inline route strings.' });
        }

        return {
          CallExpression(node) {
            const callee = node.callee;
            if (callee.type === 'Identifier' && callee.name === 'pushRoute') check(node.arguments[0]);
            if (callee.type === 'MemberExpression' && callee.object.name === 'router' && ['push', 'replace', 'navigate', 'dismissTo', 'prefetch'].includes(callee.property.name)) check(node.arguments[0]);
          },
          JSXAttribute(node) {
            if (node.name.name === 'href') check(node.value);
          },
          Property(node) {
            if (['href', 'pathname'].includes(node.key.name ?? node.key.value)) check(node.value);
          },
          VariableDeclarator(node) {
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
