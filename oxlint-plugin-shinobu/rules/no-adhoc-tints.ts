import { defineRule } from '@oxlint/plugins';

const ADHOC_TINT =
  /(?:^|[\s:])!?(?:border(?:-[tblrxyse])?-border|(?:bg|text|border(?:-[tblrxyse])?)-(?:black|white))\/(?:\d+(?:\.\d+)?|\[[^\]]+\])!?(?=$|\s)/;

const MESSAGE =
  'Use a role token: `border-hairline` for a poster or nested-card edge, `bg-scrim` under text on an image (with `text-on-scrim`). See src/global.css.';

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Use hairline and scrim tokens rather than ad hoc alpha tints.' },
    schema: [],
  },
  create(context) {
    const file = context.filename.replaceAll('\\', '/');
    if (!/\.[jt]sx?$/.test(file) || /\.test\.[jt]sx?$/.test(file)) return {};
    return {
      Literal(node) {
        if (typeof node.value === 'string' && ADHOC_TINT.test(node.value)) {
          context.report({ node, message: MESSAGE });
        }
      },
      TemplateElement(node) {
        if (typeof node.value.cooked === 'string' && ADHOC_TINT.test(node.value.cooked)) {
          context.report({ node, message: MESSAGE });
        }
      },
    };
  },
});
