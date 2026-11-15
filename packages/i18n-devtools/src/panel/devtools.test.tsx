// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setEngine } from '../engine/engine';
import { liveState, setLive } from '../live';
import { forgetMarks, mark } from '../overlay/mark';
import { holdStatus, wantStatus } from '../overlay/review';
import { openChannel } from '../server/host';
import { readSession, writeSession } from '../session';
import { testChannel, testEngine } from '../testing';
import { Devtools } from './devtools.component';

const EN = { scope: null, locale: 'en' };

function inspecting(writable: boolean) {
  const server = testChannel();
  openChannel(server.channel);
  setEngine(testEngine({ writable, activeLocale: () => 'en' }));
  setLive({ outline: 'all' });
  render(<Devtools host={document.createElement('div')} />);
  return server;
}

async function pointAtMessage(): Promise<void> {
  const text = 'Home';
  const drawn = mark(
    { key: 'nav.home', from: EN, locale: 'en', text, vars: undefined, holes: [] },
    text,
  );
  const line = document.createElement('p');
  line.textContent = drawn;
  document.body.append(line);
  Range.prototype.getBoundingClientRect = (() => ({ left: 0, top: 0, bottom: 0 })) as never;
  document.caretPositionFromPoint = (() => ({ offsetNode: line.firstChild })) as never;
  await act(async () => {
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }));
    await new Promise((done) => setTimeout(done, 40));
  });
}

function press(code: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, ctrlKey: true, altKey: true }));
  });
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  sessionStorage.clear();
  setLive({ keys: false, outline: 'off', locale: null });
  setEngine(null);
  openChannel(null);
  wantStatus(null);
  forgetMarks();
  vi.restoreAllMocks();
});

describe('the dev tools', () => {
  it('resets page inspection and language overrides while keeping the panel and editor preference', () => {
    writeSession({ open: true, editor: 'code' });
    setLive({ keys: true, outline: 'all', locale: 'fr' });
    render(<Devtools host={document.createElement('div')} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(liveState()).toEqual({ keys: false, outline: 'off', locale: null });
    expect(readSession()).toMatchObject({ open: true, editor: 'code' });
  });

  it('keeps the corner a drag stored, which it does not own, when the panel opens', () => {
    render(<Devtools host={document.createElement('div')} />);
    writeSession({ x: 40, y: 60 });

    press('KeyI');

    expect(readSession()).toMatchObject({ open: true, x: 40, y: 60 });
  });

  it('throws a switch on the page rather than into what a reload restores', () => {
    render(<Devtools host={document.createElement('div')} />);

    press('KeyK');

    expect([liveState().keys, readSession()]).toEqual([
      true,
      { open: false, editor: null, x: null, y: null },
    ]);
  });
});

describe('editing the message under the pointer', () => {
  it('opens the editor on it when the chord is pressed', async () => {
    const server = inspecting(true);
    await pointAtMessage();

    press('KeyE');

    expect(screen.getByText('Edit message')).toBeDefined();
    expect(server.sent.at(-1)).toMatchObject({
      event: 'kroma:i18n:message',
      data: { scope: null, locale: 'en', key: 'nav.home' },
    });
  });

  it('closes the editor once the dev server has written the text, without leaving the page', async () => {
    const server = inspecting(true);
    await pointAtMessage();
    press('KeyE');
    await act(async () => {
      server.answer('kroma:i18n:message', {
        message: {
          set: 'core',
          source: 'fr',
          reference: { 'nav.home': 'Accueil' },
          forms: { 'nav.home': 'Home' },
          variables: [],
        },
        refused: null,
      });
      await Promise.resolve();
    });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'House' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await act(async () => {
      server.answer('kroma:i18n:edit', { written: ['nav.home'], refused: null });
      await Promise.resolve();
    });

    expect(screen.queryByText('Edit message')).toBeNull();
    expect(liveState().outline).toBe('all');
  });

  it('names the chord in the card beside copy', async () => {
    inspecting(true);

    await pointAtMessage();

    expect(screen.getByText('copy')).toBeDefined();
    expect(screen.getByText('edit')).toBeDefined();
  });

  it('closes the editor on escape and leaves the panel as it was', async () => {
    writeSession({ open: true });
    inspecting(true);
    await pointAtMessage();
    press('KeyE');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(screen.queryByText('Edit message')).toBeNull();
    expect(readSession().open).toBe(true);
  });

  it('offers no chord and opens no editor for an engine that does not write catalogs', async () => {
    inspecting(false);
    await pointAtMessage();

    press('KeyE');

    expect(screen.getByText('copy')).toBeDefined();
    expect(screen.queryByText('edit')).toBeNull();
    expect(screen.queryByText('Edit message')).toBeNull();
  });
});

describe('how the rendered locale stands', () => {
  it('is asked of the dev server once the page is being inspected', () => {
    const server = inspecting(true);

    expect(server.sent).toEqual([
      { event: 'kroma:i18n:status', data: { locale: 'en', at: expect.any(Number) } },
    ]);
  });

  it('is asked again when the language switches', () => {
    const server = inspecting(true);

    act(() => setLive({ locale: 'fr' }));

    expect(server.sent.map(({ data }) => data.locale)).toEqual(['en', 'fr']);
  });

  it('is asked again each time a catalog file is saved, whoever saved it', () => {
    const server = inspecting(true);

    act(() => server.emit('kroma:catalog', { file: 'nav', locale: 'fr', catalog: {} }));

    expect(server.sent.map(({ event }) => event)).toEqual([
      'kroma:i18n:status',
      'kroma:i18n:status',
    ]);
  });

  it('stops listening for saves once nothing is inspected', () => {
    const server = inspecting(true);
    act(() => setLive({ outline: 'off' }));

    act(() => server.emit('kroma:catalog'));

    expect(server.sent).toHaveLength(1);
  });

  it('is never asked for an engine that does not write catalogs', async () => {
    const server = inspecting(false);

    await pointAtMessage();
    press('KeyC');

    expect(server.sent).toEqual([]);
  });

  it('is left alone while nothing on the page is being inspected', () => {
    const server = testChannel();
    openChannel(server.channel);
    setEngine(testEngine({ writable: true }));

    render(<Devtools host={document.createElement('div')} />);

    expect(server.sent).toEqual([]);
  });
});

describe('confirming the translation under the pointer', () => {
  function outdated(): void {
    act(() => {
      holdStatus({
        locale: 'en',
        coverage: 1,
        missing: 0,
        outdated: 1,
        unreviewed: 0,
        sets: [{ scope: null, outdated: ['nav.home'], unreviewed: [] }],
      });
    });
  }

  it('says in the card that the source moved, and names the chord', async () => {
    inspecting(true);
    outdated();

    await pointAtMessage();

    expect(screen.getByText(/source changed since it was translated/)).toBeDefined();
    expect(screen.getByText('confirm')).toBeDefined();
  });

  it('sends the key to the dev server when the chord is pressed', async () => {
    const server = inspecting(true);
    outdated();
    await pointAtMessage();

    press('KeyC');

    expect(server.sent.at(-1)).toMatchObject({
      event: 'kroma:i18n:confirm',
      data: { scope: null, locale: 'en', key: 'nav.home' },
    });
  });

  it('offers no chord and sends nothing for a translation that is current', async () => {
    const server = inspecting(true);
    await pointAtMessage();

    press('KeyC');

    expect(screen.queryByText('confirm')).toBeNull();
    expect(server.sent.map(({ event }) => event)).toEqual(['kroma:i18n:status']);
  });

  it('takes the grade off the card once the dev server has settled it', async () => {
    const server = inspecting(true);
    outdated();
    await pointAtMessage();
    press('KeyC');

    await act(async () => {
      server.answer('kroma:i18n:confirm', { settled: ['nav.home'], refused: null });
      await Promise.resolve();
      server.answer('kroma:i18n:status', {
        status: { locale: 'en', coverage: 1, missing: 0, outdated: 0, unreviewed: 0, sets: [] },
        refused: null,
      });
      await new Promise((done) => setTimeout(done, 40));
    });

    expect(screen.queryByText('confirm')).toBeNull();
    expect(screen.queryByText(/source changed since it was translated/)).toBeNull();
  });
});
