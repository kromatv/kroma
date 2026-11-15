import { describe, expect, it } from 'vitest';
import { cutTags, withTags } from '#web/shared/lib/tags';

describe('cutTags', () => {
  it('keeps everything as the rest until a separator is typed', () => {
    expect(cutTags('Family mem', ',\n')).toEqual({ closed: [], rest: 'Family mem' });
  });

  it('closes a name at each separator and keeps what follows the last one', () => {
    expect(cutTags('Family members, admins\nki', ',\n')).toEqual({
      closed: ['Family members', 'admins'],
      rest: 'ki',
    });
  });

  it('closes nothing for separators with no name between them', () => {
    expect(cutTags(' , ,', ',')).toEqual({ closed: [], rest: '' });
  });

  it('takes a space as a separator when it is one', () => {
    expect(cutTags('offline_access custom ', ' ')).toEqual({
      closed: ['offline_access', 'custom'],
      rest: '',
    });
  });
});

describe('withTags', () => {
  it('adds the new names after the ones already there', () => {
    expect(withTags(['admins'], ['kids', ' family '])).toEqual(['admins', 'kids', 'family']);
  });

  it('leaves out a blank name and one that is already there', () => {
    expect(withTags(['admins'], ['admins', ' ', 'kids', 'kids'])).toEqual(['admins', 'kids']);
  });
});
