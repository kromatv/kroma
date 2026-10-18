// @vitest-environment jsdom

import { MDX_COMPONENTS } from '@kromatv/workbench';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIconLibrary, type IconLibrary, IconLibraryProvider } from '#ui/lib/icons/library';
import IconsPage, { summary, title } from './06-icons.page.mdx';

// The runner already resolves every Tabler name, so the glyph half of the
// library has nothing to add here and the page's wait is the catalogue's.
vi.mock('#ui/lib/icons/every-glyph', () => ({ everyGlyph: null }));

afterEach(() => {
  cleanup();
});

function page(library: IconLibrary = createIconLibrary()) {
  render(
    <IconLibraryProvider library={library}>
      <IconsPage components={MDX_COMPONENTS} />
    </IconLibraryProvider>,
  );
  return screen.getByPlaceholderText('chevrn, playpause, delete…');
}

describe('the icons page', () => {
  it('names itself for the sidebar', () => {
    expect(title).toBe('Icons');
    expect(summary).toBeTruthy();
  });

  it('renders its prose around a live browser', () => {
    page();
    expect(screen.getByText(/The name is the whole API/)).toBeTruthy();
    expect(screen.getAllByText(/wave-sine/).length).toBeGreaterThan(0);
  });

  it('narrows the grid as the box is typed into', () => {
    const box = page();
    fireEvent.change(box, { target: { value: 'playpause' } });
    expect(screen.getByText('2 of 6250 glyphs')).toBeTruthy();
    expect(screen.getAllByText('player-pause').length).toBeGreaterThan(0);
  });

  it('reaches a glyph by a tag once a catalogue is loaded', () => {
    const box = page(
      createIconLibrary({ catalog: { trash: { category: 'System', tags: ['delete'] } } }),
    );
    fireEvent.change(box, { target: { value: 'delete' } });
    expect(screen.getByText(/matched by tag/)).toBeTruthy();
  });

  it('waits for the library the workbench fetches, then draws the grid', async () => {
    const library = createIconLibrary({
      loadCatalog: async () => ({ trash: { category: 'System', tags: ['delete'] } }),
    });
    render(
      <IconLibraryProvider library={library}>
        <IconsPage components={MDX_COMPONENTS} />
      </IconLibraryProvider>,
    );

    expect(screen.getByText(/on their way/)).toBeTruthy();

    expect(await screen.findByPlaceholderText('chevrn, playpause, delete…')).toBeTruthy();
    // The category picker appears only where the catalogue did.
    expect(screen.getAllByText('Category').length).toBeGreaterThan(0);
  });
});
