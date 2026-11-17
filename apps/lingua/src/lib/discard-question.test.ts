import { describe, expect, it } from 'vitest';
import {
  type DiscardTarget,
  discardedMessage,
  discardQuestion,
  removesLanguage,
} from './discard-question';

const PR = { number: 12, url: 'https://github.com/o/r/pull/12' };

function target(over: Partial<DiscardTarget> = {}): DiscardTarget {
  return {
    project: 'o/r',
    locale: 'de',
    language: 'German',
    drafts: 3,
    started: false,
    proposal: null,
    ...over,
  };
}

describe('removesLanguage', () => {
  it('takes a started language that was never sent, and nothing else', () => {
    expect(removesLanguage(target({ started: true }))).toBe(true);
    expect(removesLanguage(target({ started: true, proposal: PR }))).toBe(false);
    expect(removesLanguage(target())).toBe(false);
  });
});

describe('discardQuestion', () => {
  it('asks to discard the changes, saying the pull request keeps what was sent', () => {
    const question = discardQuestion(target({ proposal: PR }));

    expect(question).toMatchObject({
      title: 'Discard 3 changes in German?',
      confirmLabel: 'Discard',
      destructive: true,
    });
    expect(question.message).toContain('Pull request #12 keeps what you already sent.');
  });

  it('asks to discard the whole language when the viewer started it and never sent it', () => {
    expect(discardQuestion(target({ started: true }))).toMatchObject({
      title: 'Discard German?',
      confirmLabel: 'Discard German',
    });
  });
});

describe('discardedMessage', () => {
  it('names the language that went, or counts the changes', () => {
    expect(discardedMessage(target(), { discarded: 1, removed: true })).toBe('German discarded');
    expect(discardedMessage(target(), { discarded: 2, removed: false })).toBe(
      'Discarded 2 changes',
    );
  });
});
