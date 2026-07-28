// @vitest-environment jsdom
//
// The subtitle picker inside the player.
//
// Two things here are easy to get wrong in a way nobody notices until a viewer
// is stuck. A PICTURE sub (PGS/VobSub) cannot be rendered as text, so its row
// exists but must not be selectable - hiding it would be worse, because the
// track really is in the file and its absence would read as a bug. And the row
// INDEX is not the track index: the list is [Off, ...subs, (create?)], so an
// off-by-one hands the viewer a different language than the one they pressed.

import type { SubtitleGeneration } from '@kroma/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerSub } from '#ui/components/organisms/player/types';
import { I18nProvider } from '#ui/services/i18n';
import type { SubtitleGenBundle } from './gen';
import { SubtitlesPanel } from './SubtitlesPanel';

afterEach(cleanup);

/** The last control rendered in the tree - the trash beside a generated track
 *  or generation row. Asserted rather than indexed, for the reason above. */
function lastButton(container: HTMLElement): Element {
  const buttons = container.querySelectorAll('[role="button"]');
  const last = buttons[buttons.length - 1];
  if (!last) throw new Error('no controls rendered');
  return last;
}

const show = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

const sub = (over: Partial<PlayerSub> & { index: number }): PlayerSub => ({
  language: 'eng',
  codec: 'subrip',
  url: `/sub/${over.index}.vtt`,
  selectable: true,
  ...over,
});

const bundle = (over: Partial<SubtitleGenBundle> = {}): SubtitleGenBundle => ({
  canCreate: false,
  caps: null,
  pending: [],
  onCancel: vi.fn(),
  onDelete: vi.fn(),
  onStart: vi.fn(),
  ...over,
});

const generation = (over: Partial<SubtitleGeneration> = {}): SubtitleGeneration => ({
  id: 'g1',
  mode: 'transcribe',
  lang: 'French',
  stage: 'transcribe',
  status: 'running',
  progress: 0.42,
  etaSec: 90,
  error: null,
  subId: null,
  ...over,
});

describe('SubtitlesPanel', () => {
  it('offers Off, and turning subtitles off closes the panel', () => {
    const onSelect = vi.fn();
    const onBack = vi.fn();
    show(
      <SubtitlesPanel
        subs={[sub({ index: 0 })]}
        current={0}
        onSelect={onSelect}
        gen={bundle()}
        onBack={onBack}
      />,
    );
    fireEvent.click(screen.getByText('Off'));
    // null, not 0: "off" is the absence of a track, and 0 is a real one.
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onBack).toHaveBeenCalled();
  });

  it('selects by TRACK index, not by row position', () => {
    const onSelect = vi.fn();
    show(
      <SubtitlesPanel
        subs={[sub({ index: 3, language: 'eng' }), sub({ index: 7, language: 'fra' })]}
        current={null}
        onSelect={onSelect}
        gen={bundle()}
        onBack={vi.fn()}
      />,
    );
    // Second track sits at ROW 2 (after Off) and carries track index 7. Passing
    // the row would silently select the wrong language.
    fireEvent.click(screen.getByText('French'));
    expect(onSelect).toHaveBeenCalledWith(7);
  });

  it('shows a picture sub but refuses to select it', () => {
    const onSelect = vi.fn();
    const onBack = vi.fn();
    show(
      <SubtitlesPanel
        subs={[sub({ index: 1, codec: 'hdmv_pgs_subtitle', selectable: false, url: null })]}
        current={null}
        onSelect={onSelect}
        gen={bundle()}
        onBack={onBack}
      />,
    );
    // Present and labelled as unusable, rather than hidden: the track is really
    // in the file, and omitting it reads as a bug.
    expect(screen.getByText(/HDMV_PGS_SUBTITLE/i)).toBeTruthy();
    fireEvent.click(screen.getByText('English'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('labels a generated track with its own name and marks it AI', () => {
    show(
      <SubtitlesPanel
        subs={[sub({ index: 2, ai: true, label: 'Whisper (fr)', subId: 's-1' })]}
        current={null}
        onSelect={vi.fn()}
        gen={bundle()}
        onBack={vi.fn()}
      />,
    );
    // An AI track carries its own label rather than a language name.
    expect(screen.getByText('Whisper (fr)')).toBeTruthy();
    expect(screen.getAllByText('IA').length).toBeGreaterThan(0);
  });

  it('deletes a generated track by its subtitle id', () => {
    const onDelete = vi.fn();
    const { container } = show(
      <SubtitlesPanel
        subs={[sub({ index: 2, ai: true, label: 'Whisper (fr)', subId: 's-42' })]}
        current={null}
        onSelect={vi.fn()}
        gen={bundle({ onDelete })}
        onBack={vi.fn()}
      />,
    );
    // The last control on the row is the trash beside the track.
    fireEvent.click(lastButton(container));
    expect(onDelete).toHaveBeenCalledWith('s-42');
  });

  it('hides the create row unless generation is available', () => {
    show(
      <SubtitlesPanel
        subs={[]}
        current={null}
        onSelect={vi.fn()}
        gen={bundle({ canCreate: false })}
        onBack={vi.fn()}
      />,
    );
    expect(screen.queryByText(/create/i)).toBeNull();
  });

  it('opens the wizard from the create row', () => {
    show(
      <SubtitlesPanel
        subs={[]}
        current={null}
        onSelect={vi.fn()}
        gen={bundle({ canCreate: true })}
        onBack={vi.fn()}
      />,
    );
    const create = screen.getByText(/create/i);
    expect(create).toBeTruthy();
    fireEvent.click(create);
    // The create row is replaced by the wizard, so it must no longer be offered.
    expect(screen.queryByText(/create missing/i)).toBeNull();
  });

  it('reports a running generation with engine, stage and percent', () => {
    const { container } = show(
      <SubtitlesPanel
        subs={[]}
        current={null}
        onSelect={vi.fn()}
        gen={bundle({ pending: [generation({ progress: 0.42 })] })}
        onBack={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('Whisper');
    // 0.42 -> "42 %": the viewer is told how far along it is, rounded.
    expect(container.textContent).toContain('42 %');
    expect(container.textContent).toContain('French');
  });

  it('names the translate engine differently from transcription', () => {
    // The ENGINE prefix is what differs; the stage label beside it is its own
    // string and can legitimately mention Whisper either way, so asserting on
    // the whole row would pass for the wrong reason.
    const row = (mode: SubtitleGeneration['mode']) =>
      show(
        <SubtitlesPanel
          subs={[]}
          current={null}
          onSelect={vi.fn()}
          gen={bundle({ pending: [generation({ mode, stage: mode })] })}
          onBack={vi.fn()}
        />,
      ).container.textContent ?? '';

    const transcribe = row('transcribe');
    cleanup();
    const translate = row('translate');

    expect(transcribe).toContain('Whisper ·');
    expect(translate).not.toContain('Whisper ·');
  });

  it('shows the error instead of a progress bar when a generation fails', () => {
    const { container } = show(
      <SubtitlesPanel
        subs={[]}
        current={null}
        onSelect={vi.fn()}
        gen={bundle({
          pending: [generation({ status: 'error', error: 'model download failed' })],
        })}
        onBack={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('model download failed');
    // No percentage on a failed run - it never got anywhere.
    expect(container.textContent).not.toContain('42 %');
  });

  it('cancels a running generation by its own id', () => {
    const onCancel = vi.fn();
    const { container } = show(
      <SubtitlesPanel
        subs={[]}
        current={null}
        onSelect={vi.fn()}
        gen={bundle({ pending: [generation({ id: 'gen-9' })], onCancel })}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(lastButton(container));
    expect(onCancel).toHaveBeenCalledWith('gen-9');
  });
});
