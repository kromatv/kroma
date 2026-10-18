import { defineRule } from '../define-rule.mjs';

export default defineRule(
  'no-redundant-jsdoc-tags',
  {
    description:
      'Let TypeScript describe types instead of repeating @param, @returns, and @type tags.',
    why: 'CODE_STYLE.md prohibits these tags because signatures already express types and duplicate descriptions drift. Documentation should carry a public contract that the signature cannot express.',
    scope:
      'JSDoc block comments in TypeScript, TSX, MTS, and CTS files. Tag lines starting with @param, @return, @returns, or @type are rejected.',
    repair:
      'Remove type/signature duplication. Keep useful public guarantees, units, defaults, platform constraints, and surprising parameter semantics as short prose. Do not delete a workaround or safety constraint while editing the comment.',
    exceptions:
      'JavaScript JSDoc may be the type system and is excluded. Ordinary block/line comments, prose mentioning a tag, @example, @deprecated, and other contract tags are allowed. The rule does not decide whether prose is redundant.',
    verification:
      'Run bun run lint and the workspace typecheck. Check that public contract details remain readable. Source: CODE_STYLE.md, Document public API, nothing else.',
    invalid: ['/** @param value The value. */\nexport function parse(value: string) {}'],
    valid: ['/** Empty input produces an empty list. */\nexport function parse(value: string) {}'],
  },
  {
    meta: {
      messages: {
        violation:
          'JSDoc repeats information owned by the TypeScript signature. Remove redundant tags and keep only public-contract details as prose. Run bun run --cwd packages/lint-rules rules no-redundant-jsdoc-tags for the repair guide.',
      },
    },
    create(context) {
      if (!/\.(?:[cm]?ts|tsx)$/.test(context.filename)) return {};
      return {
        Program() {
          for (const comment of context.sourceCode.getAllComments()) {
            if (comment.type !== 'Block' || !comment.value.startsWith('*')) continue;
            const redundant = comment.value
              .split('\n')
              .some((line) =>
                /^@(param|returns?|type)\b/.test(line.trim().replace(/^\*/, '').trim()),
              );
            if (redundant) {
              context.report({ loc: comment.loc, messageId: 'violation' });
            }
          }
        },
      };
    },
  },
);
