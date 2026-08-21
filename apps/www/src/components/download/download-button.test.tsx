// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BuildFile } from '#site/lib/build-file';
import { DownloadButton } from './download-button.tsx';

const file = (over: Partial<BuildFile> = {}): BuildFile => ({
  key: 'k',
  platform: 'macOS',
  kind: '.dmg',
  meta: '50.4 MB · Apple silicon',
  url: 'https://kroma.tv/api/canary/dl/1/macos',
  name: 'KROMA_0.1.38_aarch64.dmg',
  ...over,
});

afterEach(cleanup);

describe('DownloadButton', () => {
  it('names the real file for a reader who cannot see the pill', () => {
    render(<DownloadButton file={file()} withPlatform />);

    expect(screen.getByRole('link').getAttribute('aria-label')).toContain(
      'KROMA_0.1.38_aarch64.dmg',
    );
  });

  it('shows the platform only when a list has no heading to say which', () => {
    const withIt = render(<DownloadButton file={file()} withPlatform />);
    expect(screen.getByText('macOS')).toBeDefined();
    withIt.unmount();

    render(<DownloadButton file={file()} />);
    expect(screen.queryByText('macOS')).toBeNull();
  });

  it('carries no download attribute, which a cross-origin asset would ignore', () => {
    render(<DownloadButton file={file()} />);

    expect(screen.getByRole('link').hasAttribute('download')).toBe(false);
  });

  it('shows a checksum when the file has one, and nothing when it does not', () => {
    const digest = `abcdef012345${'0'.repeat(52)}`;
    const { unmount } = render(<DownloadButton file={file({ sha256: digest })} />);
    // Shown as its first twelve characters, which is what fits beside the copy button.
    expect(screen.getByText('abcdef012345\u2026')).toBeDefined();
    unmount();

    render(<DownloadButton file={file({ sha256: null })} />);
    expect(screen.queryByText(/abcdef/)).toBeNull();
  });

  it('titles the card with the real file name', () => {
    const { container } = render(<DownloadButton file={file()} />);

    expect(container.querySelector('[title]')?.getAttribute('title')).toBe(
      'KROMA_0.1.38_aarch64.dmg',
    );
  });
});
