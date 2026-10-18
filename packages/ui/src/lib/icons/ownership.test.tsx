// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Icon } from '#ui/components/atoms/icon';
import { createIconLibrary, IconLibraryProvider } from './library';

it('renders root-owned glyphs and updates only the root that loads replacements', async () => {
  const a = createIconLibrary({ glyphs: { IconHeart: () => <span>A</span> }, loadGlyphs: null });
  const b = createIconLibrary({
    glyphs: { IconHeart: () => <span>B</span> },
    loadGlyphs: async () => ({ IconHeart: () => <span>loaded B</span> }),
  });
  const first = render(
    <IconLibraryProvider library={a}>
      <Icon name="heart" />
    </IconLibraryProvider>,
  );
  const second = render(
    <IconLibraryProvider library={b}>
      <Icon name="heart" />
    </IconLibraryProvider>,
  );
  expect(first.container.textContent).toBe('A');
  expect(second.container.textContent).toBe('B');
  await act(async () => {
    await b.load();
  });
  expect(first.container.textContent).toBe('A');
  expect(second.container.textContent).toBe('loaded B');
  first.unmount();
  expect(second.container.textContent).toBe('loaded B');
  second.unmount();
});
