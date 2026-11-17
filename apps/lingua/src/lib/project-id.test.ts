import { describe, expect, it } from 'vitest';
import { projectId, projectParams } from './project-id';

describe('project ids', () => {
  it('turns an owner/repo id into route params and back', () => {
    const params = projectParams('kromatv/kroma');

    expect(params).toEqual({ owner: 'kromatv', repo: 'kroma' });
    expect(projectId(params)).toBe('kromatv/kroma');
  });

  it('reads an id without a slash as an owner with no repository', () => {
    expect(projectParams('kromatv')).toEqual({ owner: 'kromatv', repo: '' });
  });
});
