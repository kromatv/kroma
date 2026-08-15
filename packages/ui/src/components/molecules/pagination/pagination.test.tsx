// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pagination } from './pagination';
import { type PageSlot, pageWindow, paginate } from './paging';

afterEach(cleanup);

function row(page: number, pageCount = 20, onPageChange = vi.fn()) {
  render(
    <Pagination.Root
      label="Releases"
      page={page}
      pageCount={pageCount}
      onPageChange={onPageChange}
    />,
  );
  return onPageChange;
}

function shown(): PageSlot[] {
  return [...screen.getByLabelText('Releases').querySelectorAll('[aria-label^="Page "]')].map(
    (node) => Number(node.getAttribute('aria-label')?.slice('Page '.length)),
  );
}

// The control itself carries the mark: `aria-current` is a claim about the page
// control, not about a box around it.
function current(): string | null {
  const at = screen.getByLabelText('Releases').querySelector('[aria-current="page"]');
  return at?.getAttribute('aria-label') ?? null;
}

function disabled(label: string): boolean {
  return screen.getByLabelText(label).getAttribute('aria-disabled') === 'true';
}

describe('pageWindow', () => {
  it('shows every page while the whole range fits', () => {
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });

  it('opens with the first pages and one gap before the last', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
  });

  it('gaps on both sides in the middle of a long range', () => {
    expect(pageWindow(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
  });

  it('closes with the last pages and one gap after the first', () => {
    expect(pageWindow(19, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20]);
    expect(pageWindow(20, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20]);
  });

  it('never hides a single page behind a gap', () => {
    expect(pageWindow(4, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
    expect(pageWindow(17, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20]);
  });

  it('always keeps the first and the last page', () => {
    for (let page = 1; page <= 40; page += 1) {
      const slots = pageWindow(page, 40);
      expect(slots[0]).toBe(1);
      expect(slots.at(-1)).toBe(40);
    }
  });

  it('always carries the current page', () => {
    for (let page = 1; page <= 40; page += 1) expect(pageWindow(page, 40)).toContain(page);
  });

  it('is the same width on every page of a range, so the row cannot reflow', () => {
    const widths = new Set<number>();
    for (let page = 1; page <= 40; page += 1) widths.add(pageWindow(page, 40).length);
    expect([...widths]).toEqual([7]);
  });

  it('widens by two slots per sibling', () => {
    expect(pageWindow(10, 40, 0)).toEqual([1, 'gap', 10, 'gap', 40]);
    expect(pageWindow(10, 40, 2)).toEqual([1, 'gap', 8, 9, 10, 11, 12, 'gap', 40]);
    expect(pageWindow(10, 40, 3)).toHaveLength(11);
  });

  it('clamps a page outside the range', () => {
    expect(pageWindow(0, 20)).toEqual(pageWindow(1, 20));
    expect(pageWindow(99, 20)).toEqual(pageWindow(20, 20));
  });

  it('survives a count of zero or less', () => {
    expect(pageWindow(1, 0)).toEqual([1]);
    expect(pageWindow(1, -4)).toEqual([1]);
  });
});

describe('Pagination', () => {
  it('names the landmark and draws the window around the current page', () => {
    row(10);
    expect(screen.getByLabelText('Releases')).toBeTruthy();
    expect(shown()).toEqual([1, 9, 10, 11, 20]);
    expect(current()).toBe('Page 10');
  });

  it('marks only the current page with aria-current', () => {
    row(10);
    const marked = screen.getByLabelText('Releases').querySelectorAll('[aria-current="page"]');
    expect(marked).toHaveLength(1);
  });

  it('reports the page that was pressed', () => {
    const onPageChange = row(10);
    fireEvent.click(screen.getByLabelText('Page 11'));
    expect(onPageChange).toHaveBeenCalledWith(11);
  });

  it('says nothing when the current page is pressed again', () => {
    const onPageChange = row(10);
    fireEvent.click(screen.getByLabelText('Page 10'));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('disables previous on the first page and keeps it in the row', () => {
    row(1);
    expect(disabled('Précédent')).toBe(true);
    expect(disabled('Suivant')).toBe(false);
  });

  it('disables next on the last page and keeps it in the row', () => {
    row(20);
    expect(disabled('Suivant')).toBe(true);
    expect(disabled('Précédent')).toBe(false);
  });

  it('disables both when there is a single page', () => {
    row(1, 1);
    expect(disabled('Précédent')).toBe(true);
    expect(disabled('Suivant')).toBe(true);
    expect(shown()).toEqual([1]);
  });

  it('steps one page at a time', () => {
    const onPageChange = row(10);
    fireEvent.click(screen.getByLabelText('Suivant'));
    expect(onPageChange).toHaveBeenCalledWith(11);
    fireEvent.click(screen.getByLabelText('Précédent'));
    expect(onPageChange).toHaveBeenCalledWith(9);
  });

  it('a disabled step reports nothing', () => {
    const onPageChange = row(1);
    fireEvent.click(screen.getByLabelText('Précédent'));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('translates the page names', () => {
    render(
      <Pagination.Root
        label="Sorties"
        page={1}
        pageCount={4}
        pageLabel={(page) => `Page ${page} sur 4`}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Page 3 sur 4')).toBeTruthy();
  });

  it('spells the position out through the Status part', () => {
    render(
      <Pagination.Root label="Releases" page={7} pageCount={20} onPageChange={vi.fn()}>
        <Pagination.Status />
        <Pagination.Pages />
      </Pagination.Root>,
    );
    expect(screen.getByText('Page 7 sur 20')).toBeTruthy();
  });

  it('refuses to render a part outside its Root', () => {
    expect(() => render(<Pagination.Pages />)).toThrow(/inside <Pagination.Root>/);
  });
});

describe('paginate', () => {
  const items = [1, 2, 3, 4, 5];

  it('slices the page and reports the visible range', () => {
    expect(paginate(items, 1, 2)).toMatchObject({ items: [1, 2], first: 1, last: 2, pageCount: 3 });
    expect(paginate(items, 3, 2)).toMatchObject({ items: [5], first: 5, last: 5, page: 3 });
  });

  it('clamps a page that no longer exists rather than showing nothing', () => {
    expect(paginate(items, 9, 2)).toMatchObject({ items: [5], page: 3 });
    expect(paginate(items, 0, 2)).toMatchObject({ items: [1, 2], page: 1 });
  });

  it('reports an empty list as one empty page', () => {
    expect(paginate([], 1, 2)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      first: 0,
      last: 0,
      total: 0,
    });
  });

  it('counts the whole set, not the page', () => {
    expect(paginate(items, 1, 2).total).toBe(5);
  });
});
