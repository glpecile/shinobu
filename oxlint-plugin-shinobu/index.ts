import { definePlugin } from '@oxlint/plugins';

import effectBoundary from './rules/effect-boundary.ts';
import immediateDisclosures from './rules/immediate-disclosures.ts';
import noHardcodedRoutes from './rules/no-hardcoded-routes.ts';
import logColorOnly from './rules/log-color-only.ts';
import reactCompilerBailout from './rules/react-compiler-bailout.ts';
import reanimatedNoDeps from './rules/reanimated-no-deps.ts';
import viewToggleProps from './rules/view-toggle-props.ts';
import webSafeEasing from './rules/web-safe-easing.ts';
import noPointerEventsProp from './rules/no-pointer-events-prop.ts';
import noProviderLiterals from './rules/no-provider-literals.ts';

import noTemplateClassnames from './rules/no-template-classnames.ts';
import noUnguardedPush from './rules/no-unguarded-push.ts';

export default definePlugin({
  meta: { name: 'shinobu' },
  rules: {
    'no-template-classnames': noTemplateClassnames,
    'no-unguarded-push': noUnguardedPush,
    'immediate-disclosures': immediateDisclosures,
    'no-hardcoded-routes': noHardcodedRoutes,
    'log-color-only': logColorOnly,
    'reanimated-no-deps': reanimatedNoDeps,
    'view-toggle-props': viewToggleProps,
    'web-safe-easing': webSafeEasing,
    'no-pointer-events-prop': noPointerEventsProp,
    'no-provider-literals': noProviderLiterals,
    'effect-boundary': effectBoundary,
    'react-compiler-bailout': reactCompilerBailout,
  },
});
