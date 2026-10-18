import { describe, expect, it } from 'vitest';
import { FIRST_PAGE, MORE_PAGE, pageOf } from './release-page';

const rows = (count: number) => Array.from({ length: count }, (_, at) => at);

describe('pageOf', () => {
  it('shows the first page and offers the next one with what is left', () => {
    const page = pageOf(rows(153), FIRST_PAGE);

    expect(page).toEqual({ visible: rows(FIRST_PAGE), next: MORE_PAGE, rest: 143 });
  });

  it('offers only what is left when it is less than a page', () => {
    const page = pageOf(rows(37), FIRST_PAGE + MORE_PAGE);

    expect(page).toMatchObject({ next: 7, rest: 7 });
  });

  it('offers nothing once every row is shown', () => {
    const page = pageOf(rows(4), FIRST_PAGE);

    expect(page).toEqual({ visible: rows(4), next: 0, rest: 0 });
  });
});
