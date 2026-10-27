function hasExpanded(node) {
  return node?.type === 'ObjectExpression' && node.properties.some((property) =>
    (property.key?.name ?? property.key?.value) === 'expanded' ||
    ((property.key?.name ?? property.key?.value) === 'accessibilityState' && hasExpanded(property.value)),
  );
}

export default {
  meta: { name: 'shinobu' },
  rules: {
    'immediate-disclosures': {
      meta: { schema: [] },
      create(context) {
        return {
          JSXOpeningElement(node) {
            if (!['PresstableOpacity', 'PresstableScale', 'PressableCard', 'ActionableRow'].includes(node.name.name)) return;
            const attributes = node.attributes.filter((attribute) => attribute.type === 'JSXAttribute');
            const expanded = attributes.some((attribute) =>
              attribute.name.name === 'aria-expanded' ||
              (['accessibilityState', 'accessibility'].includes(attribute.name.name) && hasExpanded(attribute.value?.expression)),
            );
            if (expanded && !attributes.some((attribute) => attribute.name.name === 'pressBehavior' &&
              (attribute.value?.value ?? attribute.value?.expression?.value) === 'immediate')) {
              context.report({ node, message: 'Disclosures must accept every press. Set pressBehavior="immediate" on the disclosure pressable.' });
            }
          },
        };
      },
    },
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
    'log-color-only': {
      meta: { schema: [] },
      create(context) {
        const file = context.filename.replaceAll('\\', '/');
        if (!/\.[jt]sx?$/.test(file) || /\.test\.[jt]sx?$/.test(file)) return {};
        const logging = /\/src\/features\/log-media\//.test(file) || [
          '/src/features/episode-details/episode-log-button.tsx',
          '/src/features/episode-details/episode-actions-sheet.tsx',
          '/src/features/up-next/ui/quick-log-button.tsx',
          '/src/app/up-next-demo.tsx',
        ].some((path) => file.endsWith(path));
        const shared = ['/src/components/button.tsx', '/src/components/fab.tsx'].some((path) => file.endsWith(path));
        function check(node, value) {
          if (typeof value !== 'string') return;
          const rawRed = /#dc262[56]\b|rgb\(\s*220\s*[, ]\s*38\s*[, ]\s*3[78]\b/i.test(value) && node.parent?.type === 'Property' && (node.parent.key.name ?? node.parent.key.value) === 'backgroundColor';
          const logToken = /--color-log\b|(?:^|[\s:])(?:bg|text|border|outline|ring|stroke|fill)-log(?:[\s/:-]|$)/.test(value);
          let parent = node.parent;
          while (['JSXExpressionContainer', 'ConditionalExpression', 'LogicalExpression', 'TSAsExpression'].includes(parent?.type)) parent = parent.parent;
          let element = node.parent;
          while (element != null && element.type !== 'JSXOpeningElement') element = element.parent;
          const solidAccent = ['Button', 'Fab'].includes(element?.name?.name) && /(?:^|[\s:])bg-accent(?:\s|$)/.test(value);
          const logVariant = value === 'log' && parent?.type === 'JSXAttribute' && parent.name.name === 'variant';
          if (rawRed || (!logging && !shared && (logToken || logVariant || solidAccent))) {
            context.report({ node, message: 'Solid red action buttons are reserved for logging. Use a neutral button here; logging entry points use variant="log" and --color-log. Branding and softer red tints keep their existing colors.' });
          }
        }
        return {
          Literal(node) { check(node, node.value); },
          TemplateElement(node) { check(node, node.value.cooked); },
        };
      },
    },
    'reanimated-no-deps': {
      meta: { schema: [] },
      create(context) {
        // Arguments each hook takes before its deps array. Native ignores the
        // array and warns; the worklet plugin already tracks captured values.
        const arity = { useAnimatedStyle: 1, useAnimatedProps: 1, useDerivedValue: 1, useAnimatedScrollHandler: 1, useAnimatedReaction: 2 };
        return {
          CallExpression(node) {
            const max = arity[node.callee.name];
            if (max != null && node.arguments.length > max) {
              context.report({
                node: node.arguments[max],
                message: `Drop the dependency array: ${node.callee.name} ignores it on native and logs a warning.`,
              });
            }
          },
        };
      },
    },
    'web-safe-easing': {
      meta: { schema: [] },
      create(context) {
        return {
          CallExpression(node) {
            const callee = node.callee;
            if (callee.type === 'MemberExpression' && callee.object.name === 'Easing' && ['in', 'out', 'inOut'].includes(callee.property.name)) {
              context.report({
                node,
                message: 'Use Easing.bezier or a lib/motion token: Reanimated web layout animations run composed easings as linear.',
              });
            }
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
