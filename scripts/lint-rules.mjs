export default {
  meta: { name: 'shinobu' },
  rules: {
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
