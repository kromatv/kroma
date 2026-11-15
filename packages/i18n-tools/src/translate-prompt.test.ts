import { describe, expect, it } from 'vitest';
import { Answer, task } from './translate-prompt.ts';

const REQUEST = {
  locale: 'ru',
  sourceLocale: 'fr',
  referenceLocale: 'en',
  categories: ['one', 'few', 'many', 'other'],
  messages: { 'player.play': { state: 'missing' as const, source: 'Lecture', reference: 'Play' } },
};

describe('task', () => {
  it('names the languages in words, with their codes and the plural categories to write', () => {
    const text = task(REQUEST);

    expect(text).toContain('Target language: Russian (ru)');
    expect(text).toContain('Its plural categories: one, few, many, other');
    expect(text).toContain('Reference language: English (en)');
  });

  it('carries the messages as the JSON the translator was promised', () => {
    const [, json = ''] = task(REQUEST).split('Messages:\n');

    expect(JSON.parse(json)).toEqual(REQUEST.messages);
  });

  it('leaves the reference language out where there is none', () => {
    expect(task({ ...REQUEST, referenceLocale: undefined })).not.toContain('Reference language');
  });
});

describe('Answer', () => {
  it('takes one entry per key and refuses anything else', () => {
    expect(Answer.safeParse({ translations: [{ key: 'a', text: 'b' }] }).success).toBe(true);
    expect(Answer.safeParse({ translations: [{ key: 'a' }] }).success).toBe(false);
  });
});
