import { defineRule, type ESTree } from '@oxlint/plugins';

import { nodeName } from '../utils.ts';

function hasExpanded(node: ESTree.Node | null | undefined): boolean {
  return node?.type === 'ObjectExpression' && node.properties.some((property) =>
    property.type === 'Property' && (nodeName(property.key) === 'expanded' ||
    (nodeName(property.key) === 'accessibilityState' && hasExpanded(property.value))),
  );
}

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Require immediate presses on disclosure controls.' },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (!['PresstableOpacity', 'PresstableScale', 'PressableCard', 'ActionableRow'].includes(nodeName(node.name) ?? '')) return;
        const attributes = node.attributes.filter((attribute) => attribute.type === 'JSXAttribute');
        const expanded = attributes.some((attribute) =>
          attribute.name.name === 'aria-expanded' ||
          (['accessibilityState', 'accessibility'].includes(nodeName(attribute.name) ?? '') && attribute.value?.type === 'JSXExpressionContainer' && hasExpanded(attribute.value.expression)),
        );
        if (expanded && !attributes.some((attribute) => attribute.name.name === 'pressBehavior' &&
          nodeName(attribute.value?.type === 'JSXExpressionContainer' ? attribute.value.expression : attribute.value) === 'immediate')) {
          context.report({ node, message: 'Disclosures must accept every press. Set pressBehavior="immediate" on the disclosure pressable.' });
        }
      },
    };
  },
});
