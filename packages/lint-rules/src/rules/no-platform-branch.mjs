import { basename } from 'node:path';
import { defineRule } from '../define-rule.mjs';

const PLATFORM_MODULE = /^#ui\/lib\/platform(?:\.[a-z]+)?$/;
const PLATFORM_SUFFIX = /\.(?:web|ios|android|native|tv)\.[cm]?[jt]sx?$/;
const PLATFORM_READS = new Set(['OS', 'select', 'isTV', 'isTVOS', 'isPad', 'Version']);

export default defineRule(
  'no-platform-branch',
  {
    description:
      'Components and features are one source for every platform: no platform flag, no Platform read, no platform-suffixed twin.',
    why: 'The kit renders the same code on web, Tizen, webOS, Apple TV, Android TV, iOS and Android. A component that branches on the platform is a component the engine failed to abstract, and each branch is a path only one target ever tests. The rendering engine (packages/ui/src/core and packages/ui/src/lib) owns every platform difference so callers never see one.',
    scope:
      'Files under packages/ui/src/components and packages/tv/src (configured in .oxlintrc.json): imports of #ui/lib/platform, member reads of Platform.OS / select / isTV / isTVOS / isPad / Version on the react-native Platform binding, and any file named *.web.*, *.ios.*, *.android.*, *.native.* or *.tv.*.',
    repair:
      'Move the difference into the engine: a primitive in packages/ui/src/lib or a style resolved in packages/ui/src/core that renders correctly everywhere, then call it with the same code on every platform. If two platforms need different visuals, make them the same visual. Never hide the branch in a helper inside the component folder.',
    exceptions:
      'packages/ui/src/core, packages/ui/src/lib and the client shells are not in scope: they are where platform code lives. Test files are not checked (a test may pin a platform); stories and fixtures are.',
    verification:
      'Run bun run lint, the ui and tv typechecks, bun run test packages/ui packages/tv, and look at the component on a browser target and a native target.',
    invalid: [
      "import { WEB } from '#ui/lib/platform'; export const pad = WEB ? 8 : 12;",
      "import { Platform } from 'react-native'; export const tv = Platform.isTV;",
    ],
    valid: ["import { Box } from '#ui/components/atoms/box'; export const pad = 8;"],
  },
  {
    meta: {
      messages: {
        flag: 'A component never branches on the platform. Move the difference into the engine (packages/ui/src/lib or core) and write one code path. Run bun run --cwd packages/lint-rules rules no-platform-branch.',
        twin: 'A platform-suffixed twin is a branch on the platform. Move the difference into the engine (packages/ui/src/lib or core) and keep one file. Run bun run --cwd packages/lint-rules rules no-platform-branch.',
      },
    },
    create(context) {
      const platformBindings = new Set();
      return {
        Program(node) {
          if (PLATFORM_SUFFIX.test(basename(context.filename))) {
            context.report({ node, messageId: 'twin' });
          }
        },
        ImportDeclaration(node) {
          if (PLATFORM_MODULE.test(node.source.value)) {
            context.report({ node, messageId: 'flag' });
            return;
          }
          if (node.source.value !== 'react-native') return;
          for (const specifier of node.specifiers) {
            if (
              specifier.type === 'ImportSpecifier' &&
              (specifier.imported.name ?? specifier.imported.value) === 'Platform'
            ) {
              platformBindings.add(specifier.local.name);
            }
          }
        },
        MemberExpression(node) {
          if (node.object.type !== 'Identifier' || !platformBindings.has(node.object.name)) return;
          const property = node.computed ? node.property.value : node.property.name;
          if (PLATFORM_READS.has(property)) context.report({ node, messageId: 'flag' });
        },
      };
    },
  },
);
