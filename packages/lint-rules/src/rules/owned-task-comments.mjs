import { defineRule } from '../define-rule.mjs';

export default defineRule(
  'owned-task-comments',
  {
    description: 'Give every TODO and FIXME comment an owner and an actionable task.',
    why: 'CODE_STYLE.md permits TODO(owner): and FIXME(owner): with a name and ideally an issue. Unowned tasks have no accountable next action and decay into permanent noise.',
    scope:
      'Comment lines beginning with TODO or FIXME after optional whitespace and a block-comment star. The marker must be immediately followed by a parenthesized owner, a colon, and a nonempty task on that line.',
    repair:
      'Use TODO(owner): concrete task, ideally followed by an issue reference. Choose the person or team actually responsible. If there is no remaining task, delete the marker while preserving any workaround, protocol, or safety rationale.',
    exceptions:
      'Prose mentioning TODO/FIXME and strings containing markers are not tasks. Owners may be a person or team identifier using letters, digits, @, dot, underscore, slash, or hyphen; blank owners and placeholders owner/someone/unknown/tbd are rejected. Issue links are encouraged but not required.',
    verification:
      'Run bun run lint and confirm the named owner and task are real. Source: CODE_STYLE.md, When a comment is worth it.',
    invalid: ['// TODO: remove workaround', '// FIXME(): restore focus'],
    valid: ['// TODO(maxsch): remove fallback after issue #123 is fixed'],
  },
  {
    meta: {
      messages: {
        violation:
          'This task comment needs a real owner and a task: TODO(owner): action or FIXME(owner): action. Assign responsibility or remove the obsolete marker. Run bun run --cwd packages/lint-rules rules owned-task-comments for the repair guide.',
      },
    },
    create(context) {
      return {
        Program() {
          for (const comment of context.sourceCode.getAllComments()) {
            for (const line of comment.value.split('\n')) {
              const text = line.replace(/^\s*\*?\s*/, '');
              if (!/^(?:TODO|FIXME)\b/.test(text)) continue;
              const task = /^(?:TODO|FIXME)\(([@A-Za-z0-9][@A-Za-z0-9._/-]*)\):\s*(\S.*)$/.exec(
                text,
              );
              if (task && !/^(?:owner|someone|unknown|tbd)$/i.test(task[1])) continue;
              context.report({ loc: comment.loc, messageId: 'violation' });
              break;
            }
          }
        },
      };
    },
  },
);
