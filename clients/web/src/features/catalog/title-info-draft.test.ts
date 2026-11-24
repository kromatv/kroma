import { expect, it } from 'vitest';
import { draftOf, editOf } from './title-info-draft';

const NOTHING = { title: null, overview: null, year: null, genres: null };

it('shows nothing in the form for a title that follows the provider', () => {
  expect(draftOf(NOTHING)).toEqual({ title: '', overview: '', year: '', genres: '' });
});

it('puts the genres on one line, and reads them back one by one', () => {
  const edit = { title: 'Heat', overview: 'Two men.', year: 1995, genres: ['Crime', 'Drama'] };

  const draft = draftOf(edit);

  expect(draft).toEqual({
    title: 'Heat',
    overview: 'Two men.',
    year: '1995',
    genres: 'Crime, Drama',
  });
  expect(editOf(draft)).toEqual(edit);
});

it('hands every field left blank back to the provider', () => {
  const draft = { title: '  ', overview: '', year: '', genres: ' , ,' };

  expect(editOf(draft)).toEqual(NOTHING);
});

it('keeps each field trimmed', () => {
  const draft = { title: ' Heat ', overview: ' Two men. ', year: '1995', genres: ' Crime ,Drama ' };

  expect(editOf(draft)).toEqual({
    title: 'Heat',
    overview: 'Two men.',
    year: 1995,
    genres: ['Crime', 'Drama'],
  });
});
