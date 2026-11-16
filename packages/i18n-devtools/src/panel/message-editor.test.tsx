// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageTarget } from '../overlay/message-target';
import { type CatalogMessage, openChannel } from '../server/host';
import { testChannel } from '../testing';
import { MessageEditor } from './message-editor.component';

const HOME: MessageTarget = { scope: null, locale: 'en', key: 'nav.home' };

let server = testChannel();

function message(over: Partial<CatalogMessage> = {}): CatalogMessage {
  return {
    set: 'core',
    source: 'fr',
    reference: { 'nav.home': 'Accueil' },
    forms: { 'nav.home': 'Home' },
    variables: [],
    ...over,
  };
}

async function said(event: string, data: object): Promise<void> {
  await act(async () => {
    server.answer(event, data);
    await Promise.resolve();
  });
}

async function editing(target: MessageTarget, read: CatalogMessage) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(<MessageEditor target={target} onClose={onClose} onSaved={onSaved} />);
  await said('kroma:i18n:message', { message: read, refused: null });
  return { onSaved, onClose };
}

function type(label: string, text: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
}

function press(name: string): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

beforeEach(() => {
  server = testChannel();
  openChannel(server.channel);
});

afterEach(() => {
  cleanup();
  openChannel(null);
});

describe('the message editor', () => {
  it('asks the dev server for the message it was opened on', () => {
    render(<MessageEditor target={HOME} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(server.sent[0]).toMatchObject({
      event: 'kroma:i18n:message',
      data: { scope: null, locale: 'en', key: 'nav.home' },
    });
    expect(screen.getByText('Reading the catalog…')).toBeDefined();
  });

  it('shows what the source language says beside the text to edit', async () => {
    await editing(HOME, message());

    expect(screen.getByText('Accueil')).toBeDefined();
    expect((screen.getByLabelText('Text') as HTMLTextAreaElement).value).toBe('Home');
  });

  it('offers one field per plural form, each beside its own source form', async () => {
    const plural = message({
      reference: { 'nav.items_one': '{count} élément', 'nav.items_other': '{count} éléments' },
      forms: {},
      variables: ['count'],
    });

    await editing({ scope: null, locale: 'en', key: 'nav.items' }, plural);

    expect(screen.getByLabelText('one')).toBeDefined();
    expect(screen.getByLabelText('other')).toBeDefined();
    expect(screen.getByText('one: {count} élément')).toBeDefined();
    expect(screen.getByText('{count}')).toBeDefined();
  });

  it('says what saving does where the source language itself is edited', async () => {
    await editing({ ...HOME, locale: 'fr' }, message({ forms: { 'nav.home': 'Accueil' } }));

    expect(
      screen.getByText('fr is the source language. Saving marks its translations outdated.'),
    ).toBeDefined();
  });

  it('says a module has to be rebuilt before the page shows what was saved', async () => {
    await editing({ scope: 'tv.kroma.vpn', locale: 'fr', key: 'nav.home' }, message());

    expect(
      screen.getByText(
        'This message belongs to tv.kroma.vpn. The page shows a saved text once that module is rebuilt.',
      ),
    ).toBeDefined();
  });

  it('says no such thing for a message of the app, which the page takes at once', async () => {
    await editing(HOME, message());

    expect(screen.queryByText(/once that module is rebuilt/)).toBeNull();
  });

  it('sends the dev server the text that moved, and says once it is written', async () => {
    const { onSaved } = await editing(HOME, message());
    type('Text', 'House');

    press('Save');
    await said('kroma:i18n:edit', { written: ['nav.home'], refused: null });

    expect(server.sent[1]).toMatchObject({
      event: 'kroma:i18n:edit',
      data: { scope: null, locale: 'en', key: 'nav.home', forms: { 'nav.home': 'House' } },
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('says why the dev server refused, and stays open on the draft', async () => {
    const { onSaved } = await editing(HOME, message());
    type('Text', 'House {count}');

    press('Save');
    await said('kroma:i18n:edit', { written: [], refused: 'nav.home is never given {count}' });

    expect(screen.getByText('nav.home is never given {count}')).toBeDefined();
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Text') as HTMLTextAreaElement).value).toBe('House {count}');
  });

  it('sends nothing while no text has moved', async () => {
    await editing(HOME, message());

    press('Save');

    expect(server.sent).toHaveLength(1);
  });

  it('closes without writing on cancel', async () => {
    const { onClose } = await editing(HOME, message());
    type('Text', 'House');

    press('Cancel');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(server.sent).toHaveLength(1);
  });

  it('says why where the dev server will not read the message', async () => {
    render(<MessageEditor target={HOME} onClose={vi.fn()} onSaved={vi.fn()} />);

    await said('kroma:i18n:message', {
      message: null,
      refused: 'nav.home is not a message of core',
    });

    expect(screen.getByText('nav.home is not a message of core')).toBeDefined();
    expect(screen.queryByLabelText('Text')).toBeNull();
  });

  it('drops an answer that lands after the editor has closed', async () => {
    const { unmount } = render(<MessageEditor target={HOME} onClose={vi.fn()} onSaved={vi.fn()} />);
    unmount();

    await said('kroma:i18n:message', { message: message(), refused: null });

    expect(screen.queryByLabelText('Text')).toBeNull();
  });

  it('says so where there is no dev server to ask', async () => {
    openChannel(null);

    render(<MessageEditor target={HOME} onClose={vi.fn()} onSaved={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Could not reach the dev server.')).toBeDefined();
  });
});
