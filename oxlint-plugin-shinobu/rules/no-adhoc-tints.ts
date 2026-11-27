import { defineRule } from '@oxlint/plugins';

const ADHOC_TINT =
  /(?:^|[\s:'"`])(border-border\/\d+|(?:bg|text|border)-(?:black|white)\/\d+)(?=$|[\s'"`])/;

const MESSAGE =
  'Use a role token: `border-hairline` for a poster or nested-card edge, `bg-scrim` under text on an image (with `text-on-scrim`). See src/global.css.';

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Use hairline and scrim tokens rather than ad hoc alpha tints.' },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === 'string' && ADHOC_TINT.test(node.value)) {
          context.report({ node, message: MESSAGE });
        }
      },
      TemplateElement(node) {
        if (ADHOC_TINT.test(node.value.raw)) context.report({ node, message: MESSAGE });
      },
    };
  },
});
