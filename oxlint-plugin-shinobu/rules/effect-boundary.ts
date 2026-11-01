import { defineRule } from '@oxlint/plugins';

const ALLOWED_DIRECTORIES = ['/src/lib/providers/', '/src/lib/http/', '/src/state/queries/'];

// The feature write hooks run their mutation's Effects at the mutation boundary.
const ALLOWED_FILES = [
  '/src/features/log-media/use-log-media.ts',
  '/src/features/watchlist-media/use-watchlist-media.ts',
  '/src/features/watchlist-media/use-unwatchlist-media.ts',
];

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Effect stays in lib/providers, lib/http, state/queries and the feature write hooks.' },
    schema: [],
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    if (
      ALLOWED_DIRECTORIES.some((directory) => filename.includes(directory)) ||
      ALLOWED_FILES.some((file) => filename.endsWith(file))
    ) {
      return {};
    }
    return {
      ImportDeclaration(node) {
        if (!/^effect(\/|$)/.test(node.source.value)) return;
        context.report({
          node,
          message:
            'Effect stays behind the query layer: call a promise function from `state/queries/*` instead (AGENTS.md, Tech stack).',
        });
      },
    };
  },
});
