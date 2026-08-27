// @vitest-environment jsdom

import { I18nProvider } from '@kroma/ui';
import { pinDesignWidth, Table } from '@kroma/ui/kit';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { memo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOWNLOAD_BOXES } from './download-columns';
import { DownloadTableHead } from './download-table-head';
import type { DownloadQuery, PageView } from './schemas';
import { useDownloadsTable } from './use-downloads-table';

const PAGE: PageView = { page: 1, perPage: 10, total: 3, pageCount: 1 };

const RELEASE = 'downloads.colRelease';
const ADDED = 'downloads.colAdded';

// Memoised on purpose. This is what the React Compiler does to the band in a
// shell build: an instance keeps one identity for its life, so a band that took
// one would bail out here exactly as it froze in the browser.
const Band = memo(DownloadTableHead);

function Queue() {
  const [query, setQuery] = useState<DownloadQuery>({});
  const { headings, sort, onSortChange } = useDownloadsTable({
    page: PAGE,
    query,
    onQueryChange: setQuery,
  });
  return (
    <I18nProvider locale="en">
      <Table.Root
        variant="plain"
        columns={DOWNLOAD_BOXES}
        label="queue"
        sort={sort}
        onSortChange={onSortChange}
      >
        <Band headings={headings} />
      </Table.Root>
    </I18nProvider>
  );
}

function heading(label: string): HTMLElement {
  const found = screen.getAllByRole('columnheader').find((cell) => cell.textContent === label);
  if (!found) throw new Error(`no column headed ${label}`);
  return found;
}

const announced = (label: string) => heading(label).getAttribute('aria-sort');

const glyph = (label: string) => heading(label).querySelector('svg')?.getAttribute('class') ?? null;

function press(label: string) {
  fireEvent.click(within(heading(label)).getByRole('button'));
}

beforeEach(() => {
  pinDesignWidth(1200);
});

afterEach(() => {
  pinDesignWidth();
});

describe('the downloads heading band', () => {
  it('opens with the newest grab named as the column doing the ordering', () => {
    render(<Queue />);

    expect(announced(ADDED)).toBe('descending');
    expect(glyph(ADDED)).toContain('tabler-icon-arrow-narrow-down');
    expect(announced(RELEASE)).toBe('none');
  });

  it('moves the announced order onto the column that was pressed', () => {
    render(<Queue />);

    press(RELEASE);

    expect(announced(RELEASE)).toBe('ascending');
    expect(glyph(RELEASE)).toContain('tabler-icon-arrow-narrow-up');
    expect(announced(ADDED)).toBe('none');
  });

  it('turns the arrow over when the column already ordering is pressed again', () => {
    render(<Queue />);

    press(RELEASE);
    press(RELEASE);

    expect(announced(RELEASE)).toBe('descending');
    expect(glyph(RELEASE)).toContain('tabler-icon-arrow-narrow-down');
  });

  it('draws the idle glyph on a column that can order but is not', () => {
    render(<Queue />);

    expect(glyph(RELEASE)).toContain('tabler-icon-arrows-sort');
  });

  it('leaves a column the ledger cannot order alone', () => {
    render(<Queue />);

    const speed = heading('downloads.colSpeed');

    expect(speed.getAttribute('aria-sort')).toBeNull();
    expect(within(speed).queryByRole('button')).toBeNull();
  });

  it('drops the columns the narrow shell has no room for, header and all', () => {
    pinDesignWidth(480);
    render(<Queue />);

    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      RELEASE,
      '',
    ]);
  });
});
