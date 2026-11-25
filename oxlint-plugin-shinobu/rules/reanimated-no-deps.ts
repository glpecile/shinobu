import { defineRule } from '@oxlint/plugins';

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Reject dependency arrays that Reanimated ignores on native.' },
    schema: [],
  },
  create(context) {
    const arity: Record<string, number> = { useAnimatedStyle: 1, useAnimatedProps: 1, useDerivedValue: 1, useAnimatedScrollHandler: 1, useAnimatedReaction: 2 };
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return;
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
});
