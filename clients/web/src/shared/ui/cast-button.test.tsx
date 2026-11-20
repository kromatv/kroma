// @vitest-environment jsdom

import { DeviceId } from '@kromatv/client';
import { ItemId } from '@kromatv/client/media';
import { type Cast, I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { castSession, receiver } from '#web/shared/lib/cast.fixture';
import { CastButton } from './cast-button.component';

const hold = vi.hoisted((): { cast: Cast | null } => ({ cast: null }));
const picker = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock('@kromatv/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/ui')>()),
  useCast: () => {
    if (!hold.cast) {
      throw new Error('the test gave no cast session');
    }
    return hold.cast;
  },
}));
vi.mock('@kromatv/ui/kit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/ui/kit')>()),
  toast,
}));
vi.mock('#web/shared/ui/cast-picker.component', () => ({ castPicker: picker }));

const inputHost = createInputTestHost();
const ITEM = ItemId.parse('it1');

const tv = (id: string) => receiver({ id: DeviceId.parse(id), name: id });

function setCast(over: Partial<Cast>) {
  hold.cast = castSession({
    playOn: vi.fn(async () => null),
    ...over,
  });
  return hold.cast;
}

function show() {
  return inputHost.render(
    <I18nProvider locale="en">
      <CastButton itemId={ITEM} />
    </I18nProvider>,
  );
}

function press() {
  fireEvent.click(screen.getByRole('button', { name: 'Play on TV' }));
}

beforeEach(() => {
  inputHost.clearPressGuard();
  picker.mockReset();
  toast.mockReset();
});
afterEach(cleanup);

describe('the Play on TV button', () => {
  it('is absent while no television is available', () => {
    setCast({ available: false });

    const { container } = show();

    expect(container.querySelector('button')).toBeNull();
  });

  it('plays on the only television without asking', async () => {
    const cast = setCast({ receivers: [tv('tv-salon-01')] });
    show();

    press();

    await waitFor(() =>
      expect(cast.playOn).toHaveBeenCalledWith(DeviceId.parse('tv-salon-01'), ITEM),
    );
    expect(picker).not.toHaveBeenCalled();
  });

  it('plays on the television picked when there are several', async () => {
    const cast = setCast({ receivers: [tv('tv-salon-01'), tv('tv-salon-02')] });
    picker.mockResolvedValue(DeviceId.parse('tv-salon-02'));
    show();

    press();

    await waitFor(() =>
      expect(cast.playOn).toHaveBeenCalledWith(DeviceId.parse('tv-salon-02'), ITEM),
    );
  });

  it('does nothing when the picker is dismissed', async () => {
    const cast = setCast({ receivers: [tv('tv-salon-01'), tv('tv-salon-02')] });
    picker.mockResolvedValue(undefined);
    show();

    press();

    await waitFor(() => expect(picker).toHaveBeenCalled());
    expect(cast.playOn).not.toHaveBeenCalled();
  });

  it('tells the person when the television cannot be reached', async () => {
    setCast({ receivers: [tv('tv-salon-01')], playOn: vi.fn(async () => 'cast.gone' as const) });
    show();

    press();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ message: 'That device is no longer available' }),
    );
  });
});
