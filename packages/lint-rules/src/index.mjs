import indexReexportsOnly from './rules/index-reexports-only.mjs';
import noCommentBanners from './rules/no-comment-banners.mjs';
import noEmDashes from './rules/no-em-dashes.mjs';
import noModuleMutableBindings from './rules/no-module-mutable-bindings.mjs';
import noNestedTemplates from './rules/no-nested-templates.mjs';
import noRawDesignValues from './rules/no-raw-design-values.mjs';
import noReactForwardRef from './rules/no-react-forward-ref.mjs';
import noRedundantJsdocTags from './rules/no-redundant-jsdoc-tags.mjs';
import noRelativeWorkspaceImports from './rules/no-relative-workspace-imports.mjs';
import noUnknownRecordAssertions from './rules/no-unknown-record-assertions.mjs';
import ownedTaskComments from './rules/owned-task-comments.mjs';
import reExportFrom from './rules/re-export-from.mjs';
import useStatePair from './rules/use-state-pair.mjs';

export default {
  meta: { name: 'kroma', version: '0.0.0' },
  rules: {
    'index-reexports-only': indexReexportsOnly,
    'no-nested-templates': noNestedTemplates,
    'owned-task-comments': ownedTaskComments,
    'no-redundant-jsdoc-tags': noRedundantJsdocTags,
    'no-unknown-record-assertions': noUnknownRecordAssertions,
    'no-em-dashes': noEmDashes,
    'no-raw-design-values': noRawDesignValues,
    'no-relative-workspace-imports': noRelativeWorkspaceImports,
    'no-module-mutable-bindings': noModuleMutableBindings,
    'no-react-forward-ref': noReactForwardRef,
    'no-comment-banners': noCommentBanners,
    're-export-from': reExportFrom,
    'use-state-pair': useStatePair,
  },
};
