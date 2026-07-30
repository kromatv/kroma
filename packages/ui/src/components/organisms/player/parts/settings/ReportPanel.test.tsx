// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '#ui/services/i18n';
import { ReportPanel } from './ReportPanel';

afterEach(cleanup);

const show = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ReportPanel', () => {
  it('sends the category that was pressed', () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    show(<ReportPanel onReport={onReport} onBack={() => {}} />);

    fireEvent.click(screen.getByText('Audio problem'));
    expect(onReport).toHaveBeenCalledWith('audio');
  });

  it('becomes its own receipt once the report is in, instead of closing', async () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    show(<ReportPanel onReport={onReport} onBack={() => {}} />);

    fireEvent.click(screen.getByText('Subtitles'));
    expect(await screen.findByText('Thanks, your report has been sent.')).toBeTruthy();
    expect(screen.queryByText('Subtitles')).toBeNull();
  });

  it('says so when the report could not be sent, and lets the viewer retry', async () => {
    const onReport = vi.fn().mockRejectedValue(new Error('offline'));
    show(<ReportPanel onReport={onReport} onBack={() => {}} />);

    fireEvent.click(screen.getByText('Other'));
    expect(await screen.findByText('Could not send the report.')).toBeTruthy();
    fireEvent.click(screen.getByText('Other'));
    expect(onReport).toHaveBeenCalledTimes(2);
  });

  it('ignores a second press while the first is still in flight', () => {
    const gate = deferred();
    const onReport = vi.fn().mockReturnValue(gate.promise);
    show(<ReportPanel onReport={onReport} onBack={() => {}} />);

    fireEvent.click(screen.getByText('Video problem'));
    fireEvent.click(screen.getByText('Video problem'));
    expect(onReport).toHaveBeenCalledTimes(1);
    gate.resolve();
  });
});
