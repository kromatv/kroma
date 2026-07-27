// @vitest-environment jsdom
//
// The two choices a report from the sofa is made of: what is affected, and what
// kind of problem it is.

import { I18nProvider } from '@kroma/ui';
import { clearPressGuard } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CategoryRows, SubjectRow } from '#tv/features/reports/parts';

/** Every kit control is a node of the spatial navigator, and a node needs a
 * navigator - the router gives every screen one. */
const show = (ui: ReactElement) =>
  renderRaw(onScreen(<I18nProvider locale="en">{ui}</I18nProvider>));

afterEach(() => {
  cleanup();
  clearPressGuard();
});

describe('CategoryRows', () => {
  it('offers every category with the hint that explains it', () => {
    show(<CategoryRows selected={null} onSelect={() => {}} />);
    expect(screen.getByText('Incorrect information')).toBeTruthy();
    expect(screen.getByText('Missing, out of sync or wrong subtitles')).toBeTruthy();
  });

  it('reports the category that was chosen', () => {
    const onSelect = vi.fn();
    show(<CategoryRows selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Audio problem'));
    expect(onSelect).toHaveBeenCalledWith('audio');
  });
});

describe('SubjectRow', () => {
  const episodes = [
    { id: 'ep1', label: 'S01E01' },
    { id: 'ep2', label: 'S01E02' },
  ];

  it('offers the whole series alongside each episode', () => {
    show(<SubjectRow episodes={episodes} selectedId="show1" wholeId="show1" onSelect={() => {}} />);
    expect(screen.getByText('The whole series')).toBeTruthy();
    expect(screen.getByText('S01E02')).toBeTruthy();
  });

  it('narrows the report to one episode', () => {
    const onSelect = vi.fn();
    show(<SubjectRow episodes={episodes} selectedId="show1" wholeId="show1" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('S01E02'));
    expect(onSelect).toHaveBeenCalledWith('ep2');
  });

  it('goes back to the whole series', () => {
    const onSelect = vi.fn();
    show(<SubjectRow episodes={episodes} selectedId="ep2" wholeId="show1" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('The whole series'));
    expect(onSelect).toHaveBeenCalledWith('show1');
  });
});
