// @vitest-environment jsdom
//
// Which language the app comes up in.
//
// The precedence is the whole of it: the signed-in account wins (so the choice
// follows a viewer between their TV and their phone), then the device override,
// then the browser. Getting the order wrong means a profile switch silently
// keeps the previous person's language, which is the kind of bug nobody reports
// and everybody notices.

import { saveLocalePref, setSessionStorage } from '@kroma/core';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocale } from './i18n';
import { LocaleProvider } from './locale';

/** Prints the active locale, so an assertion can read it off the tree. */
function Probe() {
  return <>{useLocale()}</>;
}

function fakeClient() {
  const client = {
    setLocale: vi.fn(),
    updateLanguage: vi.fn(async () => undefined),
  };
  return client as unknown as Parameters<typeof LocaleProvider>[0]['client'] & typeof client;
}

function memoryStore() {
  const map = new Map<string, string>();
  setSessionStorage({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  });
  return map;
}

beforeEach(() => {
  memoryStore();
});

afterEach(() => {
  setSessionStorage(null);
  vi.restoreAllMocks();
});

describe('LocaleProvider', () => {
  it('adopts the device override when signed out', () => {
    saveLocalePref('en');
    const { container } = render(
      <LocaleProvider client={fakeClient()}>
        <Probe />
      </LocaleProvider>,
    );
    expect(container.textContent).toBe('en');
  });

  // The account is authoritative: it is what makes the choice follow a viewer
  // from the television to the phone.
  it("prefers the account's language over the device override", () => {
    saveLocalePref('en');
    const { container } = render(
      <LocaleProvider client={fakeClient()} accountLanguage="fr">
        <Probe />
      </LocaleProvider>,
    );
    expect(container.textContent).toBe('fr');
  });

  it('adopts a language that arrives later (a profile switch)', () => {
    const client = fakeClient();
    const { container, rerender } = render(
      <LocaleProvider client={client}>
        <Probe />
      </LocaleProvider>,
    );
    rerender(
      <LocaleProvider client={client} accountLanguage="en">
        <Probe />
      </LocaleProvider>,
    );
    expect(container.textContent).toBe('en');
  });

  it('ignores a language the catalog does not have', () => {
    const { container } = render(
      <LocaleProvider client={fakeClient()} accountLanguage="klingon">
        <Probe />
      </LocaleProvider>,
    );
    // Falls through to the device/browser resolution rather than rendering keys.
    expect(container.textContent).not.toBe('klingon');
  });

  it("keeps the client's Accept-Language in step", () => {
    const client = fakeClient();
    render(
      <LocaleProvider client={client} accountLanguage="en">
        <Probe />
      </LocaleProvider>,
    );
    expect(client.setLocale).toHaveBeenCalledWith('en');
  });

  // The TV's connect screen renders before any server is reached, and its copy
  // still has to be translated.
  it('works with no client at all', () => {
    saveLocalePref('en');
    const { container } = render(
      <LocaleProvider client={null}>
        <Probe />
      </LocaleProvider>,
    );
    expect(container.textContent).toBe('en');
  });

  it('mirrors the locale onto <html lang> only when asked', () => {
    document.documentElement.lang = '';
    render(
      <LocaleProvider client={fakeClient()} accountLanguage="en" syncHtmlLang>
        <Probe />
      </LocaleProvider>,
    );
    expect(document.documentElement.lang).toBe('en');
  });

  it('leaves <html lang> alone by default', () => {
    document.documentElement.lang = 'untouched';
    render(
      <LocaleProvider client={fakeClient()} accountLanguage="en">
        <Probe />
      </LocaleProvider>,
    );
    expect(document.documentElement.lang).toBe('untouched');
  });
});
