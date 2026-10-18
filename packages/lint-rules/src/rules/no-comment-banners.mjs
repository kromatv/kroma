import { defineRule } from '../define-rule.mjs';

export default defineRule(
  'no-comment-banners',
  {
    description: 'Use named functions or modules instead of decorative comment section banners.',
    why: 'CODE_STYLE.md prohibits section banners because internal signposting usually means a file needs splitting or clearer names.',
    scope:
      'Line and block comments containing a line framed by at least three hyphens or equals signs, or a separator of at least four such characters. The rule inspects comments, not strings or Markdown files.',
    repair:
      'Remove decorative punctuation. If the comment only labels a section, replace the section with a named function or split the file at its responsibility boundary. Preserve any platform workaround, protocol rule, or safety reason carried by the comment.',
    exceptions:
      'Ordinary prose, JSDoc prose, lint directives, and hyphens within sentences are allowed. ASCII art using other characters is not detected. No automatic fix: a banner can carry a constraint that must be preserved.',
    verification:
      'Run bun run lint and the focused tests for code moved into a function or module. Re-read the comment before removal to preserve non-obvious constraints. Source: CODE_STYLE.md, Never write these.',
    invalid: [
      '// ---- helpers ----\nexport const value = 1;',
      '// ========\nexport const value = 1;',
    ],
    valid: ['// Tizen rejects ranges past EOF; clamp before sending.\nexport const value = 1;'],
  },
  {
    meta: {
      messages: {
        banner:
          'Decorative comment banners hide a naming or file-boundary problem. Extract a named function/module and remove the banner, preserving any workaround or safety rationale. Run bun run --cwd packages/lint-rules rules no-comment-banners for the repair guide.',
      },
    },
    create(context) {
      return {
        Program() {
          for (const comment of context.sourceCode.getAllComments()) {
            const banner = comment.value.split('\n').some((line) => {
              const text = line.trim().replace(/^\*/, '').trim();
              const separator = text.length >= 4 && /^[-=]+$/.test(text);
              const framed = text.length >= 6 && /^[-=]{3}/.test(text) && /[-=]{3}$/.test(text);
              return separator || framed;
            });
            if (banner) {
              context.report({ loc: comment.loc, messageId: 'banner' });
            }
          }
        },
      };
    },
  },
);
