// @vitest-environment jsdom

import type { ReportCategory } from '@kroma/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '#ui/services/i18n';
import { SettingsPanel } from './settings-panel';
import { APPEARANCE, controller, GEN } from './settings-panel.fixture';

afterEach(cleanup);

function panel(onReport?: (category: ReportCategory) => Promise<void>): ReactElement {
  return (
    <I18nProvider locale="en">
      <SettingsPanel
        controller={controller()}
        appearance={APPEARANCE}
        onAppearanceChange={vi.fn()}
        statsOn={false}
        onToggleStats={vi.fn()}
        subtitleGen={GEN}
        onReport={onReport}
        onClose={vi.fn()}
      />
    </I18nProvider>
  );
}

describe('the player settings panel, reporting', () => {
  it('offers no report row when the host cannot send one', () => {
    render(panel(undefined));
    expect(screen.queryByText('Report a problem')).toBeNull();
  });

  it('opens the categories and stays open', () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    render(panel(onReport));

    fireEvent.click(screen.getByText('Report a problem'));

    expect(screen.getByText('Audio problem')).toBeTruthy();
    expect(screen.queryByText('Playback speed')).toBeNull();
  });

  it('sends the category that was picked', async () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    render(panel(onReport));

    fireEvent.click(screen.getByText('Report a problem'));
    fireEvent.click(screen.getByText('Subtitles'));

    expect(onReport).toHaveBeenCalledWith('subtitles');
    expect(await screen.findByText('Thanks, your report has been sent.')).toBeTruthy();
  });
});
