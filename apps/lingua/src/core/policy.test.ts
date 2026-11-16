import { describe, expect, it } from 'vitest';
import { parsePolicy, policyLocales, withDraftLocale } from './policy';

describe('parsePolicy', () => {
  it('says why an i18n.json cannot be read', () => {
    const errors = [undefined, '{', '{"source": 1}'].map((text) => {
      const parsed = parsePolicy(text);
      return parsed.ok ? null : parsed.error;
    });

    expect(errors).toEqual([
      'i18n.json is missing',
      'i18n.json is not JSON',
      expect.stringMatching(/^i18n\.json: /),
    ]);
  });

  it('reads a project that lists no language but its source', () => {
    const parsed = parsePolicy('{ "source": "en" }');

    expect(parsed.ok && policyLocales(parsed.policy)).toEqual(['en']);
  });
});

describe('withDraftLocale', () => {
  it('keeps a listed language with no settings as an empty object', () => {
    const text = withDraftLocale('{ "source": "en", "locales": { "fr": {} } }', 'de');

    expect(text).toBe(
      '{\n  "source": "en",\n  "locales": {\n    "fr": {},\n    "de": { "stage": "draft" }\n  }\n}\n',
    );
  });
});
