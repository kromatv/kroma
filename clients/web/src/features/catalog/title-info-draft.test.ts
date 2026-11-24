import { expect, it } from 'vitest';
import { draftOf, editOf } from './title-info-draft';

const NOTHING = {
  title: null,
  sortTitle: null,
  overview: null,
  year: null,
  released: null,
  genres: null,
};

it('shows nothing in the form for a title that follows the provider', () => {
  expect(draftOf(NOTHING)).toEqual({
    title: '',
    sortTitle: '',
    overview: '',
    released: '',
    genres: '',
  });
});

it('puts the genres on one line, and reads them back one by one', () => {
  const edit = {
    title: 'Heat',
    sortTitle: 'Heat (1995)',
    overview: 'Two men.',
    year: 1995,
    released: null,
    genres: ['Crime', 'Drama'],
  };

  const draft = draftOf(edit);

  expect(draft).toEqual({
    title: 'Heat',
    sortTitle: 'Heat (1995)',
    overview: 'Two men.',
    released: '1995',
    genres: 'Crime, Drama',
  });
  expect(editOf(draft)).toEqual(edit);
});

it('shows the release date in place of its year, and sends it alone', () => {
  const edit = { ...NOTHING, year: 1995, released: '1995-12-15' };

  const draft = draftOf(edit);

  expect(draft.released).toBe('1995-12-15');
  expect(editOf(draft)).toEqual({ ...NOTHING, released: '1995-12-15' });
});

it('hands every field left blank back to the provider', () => {
  const draft = { title: '  ', sortTitle: ' ', overview: '', released: ' ', genres: ' , ,' };

  expect(editOf(draft)).toEqual(NOTHING);
});

it('keeps each field trimmed', () => {
  const draft = {
    title: ' Heat ',
    sortTitle: '',
    overview: ' Two men. ',
    released: ' 1995 ',
    genres: ' Crime ,Drama ',
  };

  expect(editOf(draft)).toEqual({
    title: 'Heat',
    sortTitle: null,
    overview: 'Two men.',
    year: 1995,
    released: null,
    genres: ['Crime', 'Drama'],
  });
});
