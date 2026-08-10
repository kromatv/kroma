import { describe, expect, it } from 'vitest';
import { issueField, type StandardIssue } from './standard-schema';

const issue = (path?: StandardIssue['path']): StandardIssue => ({ message: 'nope', path });

describe('issueField', () => {
  it('is the first path segment, however the validator spelled it', () => {
    expect(issueField(issue(['email']))).toBe('email');
    expect(issueField(issue([{ key: 'email' }, 'inner']))).toBe('email');
    expect(issueField(issue([0]))).toBe('0');
    expect(issueField(issue([{ key: 3 }]))).toBe('3');
  });

  it('blames no field for a check on the whole object', () => {
    expect(issueField(issue())).toBeUndefined();
    expect(issueField(issue([]))).toBeUndefined();
  });

  it('blames no field for a key no form control can carry', () => {
    expect(issueField(issue([Symbol('secret')]))).toBeUndefined();
    expect(issueField(issue([{ key: Symbol('secret') }]))).toBeUndefined();
  });
});
