import { describe, expect, it } from 'vitest';
import { msg, resolveMessage } from './message';

const catalog: Record<string, string> = {
  'form.required': 'This one is required.',
  'form.tooShort': 'Use at least {min} characters.',
  file_other: '{count} files',
  file_one: 'one file',
};

const t = (key: string, vars?: Record<string, string | number>) => {
  const plural =
    typeof vars?.count === 'number' ? `${key}_${vars.count === 1 ? 'one' : 'other'}` : key;
  const template = catalog[plural] ?? catalog[key] ?? key;
  return template.replace(/\{(\w+)}/g, (whole, name: string) =>
    vars && name in vars ? String(vars[name]) : whole,
  );
};

describe('msg', () => {
  it('is the bare key when there is nothing to interpolate', () => {
    expect(msg('form.required')).toBe('form.required');
    expect(msg('form.required', {})).toBe('form.required');
  });

  it('carries vars in a query tail', () => {
    expect(msg('form.tooShort', { min: 8 })).toBe('form.tooShort?min=8');
    expect(msg('form.between', { min: 8, max: 64 })).toBe('form.between?min=8&max=64');
  });

  it('escapes a value that would break the tail apart', () => {
    expect(msg('form.oneOf', { options: 'a&b=c' })).toBe('form.oneOf?options=a%26b%3Dc');
  });
});

describe('resolveMessage', () => {
  it('translates a key and fills its vars', () => {
    expect(resolveMessage(msg('form.tooShort', { min: 8 }), t)).toBe('Use at least 8 characters.');
  });

  it('keeps count numeric so the catalog can pick a plural', () => {
    expect(resolveMessage(msg('file', { count: 1 }), t)).toBe('one file');
    expect(resolveMessage(msg('file', { count: 4 }), t)).toBe('4 files');
  });

  it('shows a plain sentence as written, translator or not', () => {
    const written = 'Use at least eight characters.';
    expect(resolveMessage(written, t)).toBe(written);
    expect(resolveMessage(written)).toBe(written);
  });

  it('leaves a sentence that merely ends in a question mark alone', () => {
    expect(resolveMessage('Is that really your address?', t)).toBe('Is that really your address?');
  });

  it('interpolates a literal template when no catalog knows it', () => {
    expect(resolveMessage(msg('At least {min} characters, please.', { min: 8 }))).toBe(
      'At least 8 characters, please.',
    );
  });

  it('falls back to the key when there is no translator', () => {
    expect(resolveMessage(msg('form.tooShort', { min: 8 }))).toBe('form.tooShort');
  });

  it('round-trips a value that was escaped on the way in', () => {
    expect(resolveMessage(msg('{options} only', { options: 'a&b' }))).toBe('a&b only');
  });
});
