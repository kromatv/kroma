// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BuildFile } from '#site/lib/build-file';
import { BuildRow } from './build-row.tsx';

const file = (over: Partial<BuildFile> = {}): BuildFile => ({
  key: 'k',
  platform: 'Samsung',
  kind: '.wgt',
  meta: '10.6 MB',
  url: 'https://kroma.tv/x.wgt',
  name: 'KROMA-tizen-0.1.39.wgt',
  ...over,
});

afterEach(cleanup);

describe('BuildRow', () => {
  it('is a native details, so the history is in the prerendered HTML', () => {
    const { container } = render(<BuildRow version="0.1.39" at={null} files={[file()]} />);

    expect(container.querySelector('details')).not.toBeNull();
  });

  it('opens the newest on arrival and leaves the rest folded', () => {
    const open = render(<BuildRow version="0.1.39" at={null} files={[file()]} featured />);
    expect(open.container.querySelector('details')?.open).toBe(true);
    open.unmount();

    const shut = render(<BuildRow version="0.1.38" at={null} files={[file()]} />);
    expect(shut.container.querySelector('details')?.open).toBe(false);
  });

  it('counts the files it carries', () => {
    render(<BuildRow version="0.1.39" at={null} files={[file(), file({ key: 'b' })]} />);

    expect(screen.getByText('2')).toBeDefined();
  });

  it('shows the note a build carries, and nothing when it has none', () => {
    const withNote = render(
      <BuildRow version="0.1.39" at={null} files={[file()]} note="a commit title" />,
    );
    expect(screen.getByText('a commit title')).toBeDefined();
    withNote.unmount();

    render(<BuildRow version="0.1.39" at={null} files={[file()]} />);
    expect(screen.queryByText('a commit title')).toBeNull();
  });

  it('links out to where the build came from when it is given one', () => {
    render(
      <BuildRow
        version="0.1.39"
        at={null}
        files={[file()]}
        source={{ href: 'https://github.com/x/y/releases', label: 'Release notes' }}
      />,
    );

    const link = screen.getByRole('link', { name: /Release notes/ });
    expect(link.getAttribute('href')).toBe('https://github.com/x/y/releases');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});
