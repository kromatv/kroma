// @vitest-environment jsdom

import type { AudioTrack } from '@kroma/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '#ui/services/i18n';
import { AudioPanel } from './AudioPanel';

afterEach(cleanup);

const show = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

const track = (over: Partial<AudioTrack> & { index: number }): AudioTrack => ({
  codec: 'ac3',
  channels: 6,
  language: 'eng',
  default: false,
  ...over,
});

describe('AudioPanel', () => {
  it('says the file carries none rather than drawing an empty list', () => {
    show(<AudioPanel tracks={[]} current={0} onSelect={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('No audio track detected.')).toBeTruthy();
  });

  it('names a track by its own title, and by its language when it has none', () => {
    show(
      <AudioPanel
        tracks={[
          track({ index: 3, title: 'TrueHD 7.1', codec: 'truehd', channels: 8 }),
          track({ index: 7, language: 'fra' }),
        ]}
        current={3}
        onSelect={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText('TrueHD 7.1')).toBeTruthy();
    expect(screen.getByText('TRUEHD · 7.1')).toBeTruthy();
    expect(screen.getByText('French')).toBeTruthy();
  });

  it('selects by TRACK index, not by row position, and closes behind it', () => {
    const onSelect = vi.fn();
    const onBack = vi.fn();
    show(
      <AudioPanel
        tracks={[track({ index: 3 }), track({ index: 7, language: 'fra' })]}
        current={3}
        onSelect={onSelect}
        onBack={onBack}
      />,
    );
    // Second row, track index 7: passing the row would hand over the wrong
    // language.
    fireEvent.click(screen.getByText('French'));
    expect(onSelect).toHaveBeenCalledWith(7);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
