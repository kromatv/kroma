import { describe, expect, it } from 'vitest';
import { issueText } from './issue-text';

describe('issueText', () => {
  it('names a placeholder the source does not have', () => {
    expect(issueText({ level: 'error', code: 'unknown-token', detail: 'name' })).toBe(
      '`{name}` is not in the source',
    );
  });

  it('names a placeholder the translation dropped', () => {
    expect(issueText({ level: 'warning', code: 'missing-token', detail: 'count' })).toBe(
      '`{count}` from the source is missing',
    );
  });

  it('names a reference to a message that does not exist', () => {
    expect(issueText({ level: 'error', code: 'unknown-ref', detail: 'common.ok' })).toBe(
      '`$t(common.ok)` names no message of this project',
    );
  });

  it('still says what is wrong when the server sends no detail', () => {
    expect(issueText({ level: 'error', code: 'unknown-token' })).toBe(
      'A placeholder is not in the source',
    );
  });

  it('gives the length limit of a message that is too long', () => {
    expect(issueText({ level: 'error', code: 'too-long' })).toBe('Longer than 4,000 characters');
  });

  it('says what is wrong with each issue when the server sends no detail', () => {
    const codes = ['missing-token', 'unknown-ref', 'control-character'] as const;

    expect(codes.map((code) => issueText({ level: 'error', code }))).toEqual([
      'A placeholder from the source is missing',
      'A `$t()` names no message of this project',
      'Contains an invisible control character',
    ]);
  });
});
