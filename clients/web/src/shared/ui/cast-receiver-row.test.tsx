// @vitest-environment jsdom

import { DeviceId } from '@kromatv/client';
import type { CastReceiver } from '@kromatv/client/cast';
import { type Cast, I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaItem, nowPlaying, receiver } from '#web/shared/lib/cast.fixture';
import { CastReceiverRow, DeviceRow } from './cast-receiver-row.component';

const hold = vi.hoisted((): { waking: DeviceId | null; needsPower: boolean } => ({
  waking: null,
  needsPower: false,
}));

vi.mock('@kromatv/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/ui')>()),
  useCast: (): Pick<Cast, 'waking' | 'wakingNeedsPower'> => ({
    waking: hold.waking,
    wakingNeedsPower: hold.needsPower,
  }),
}));

const inputHost = createInputTestHost();

function mount(row: CastReceiver, picked: { selected: boolean }) {
  const onPick = vi.fn();
  inputHost.render(
    <I18nProvider locale="en">
      <CastReceiverRow receiver={row} selected={picked.selected} onPick={onPick} />
    </I18nProvider>,
  );
  return onPick;
}

const show = (row: CastReceiver) => mount(row, { selected: false });

beforeEach(() => {
  inputHost.clearPressGuard();
  hold.waking = null;
  hold.needsPower = false;
});
afterEach(cleanup);

describe('a television in the picker', () => {
  it('says Ready when it plays nothing', () => {
    show(receiver());

    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('names the title it plays', () => {
    show(receiver({ nowPlaying: nowPlaying({ item: mediaItem({ title: 'Dune' }) }) }));

    expect(screen.getByText('Dune')).toBeTruthy();
  });

  it('says Off when it sleeps', () => {
    show(receiver({ asleep: true }));

    expect(screen.getByText('Off')).toBeTruthy();
  });

  it('shows a spinner while it turns on', () => {
    hold.waking = DeviceId.parse('tv-salon-01');

    show(receiver({ asleep: true }));

    expect(screen.getByText('Turning on…')).toBeTruthy();
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('asks for a hand on the remote when it cannot be woken', () => {
    hold.waking = DeviceId.parse('tv-salon-01');
    hold.needsPower = true;

    show(receiver({ asleep: true }));

    expect(screen.getByText(/turn it on with its remote/)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('marks the one being driven as selected and answers a press', () => {
    const onPick = mount(receiver(), { selected: true });

    fireEvent.click(screen.getByRole('option', { name: /Salon/ }));

    expect(screen.getByRole('option', { name: /Salon/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(onPick).toHaveBeenCalledOnce();
  });
});

describe('the local device row', () => {
  it('is online and unselected by default', () => {
    inputHost.render(
      <DeviceRow
        icon="device-desktop"
        name="This device"
        detail="Play here"
        selected={false}
        onPick={vi.fn()}
      />,
    );

    expect(screen.getByText('Play here')).toBeTruthy();
  });
});
