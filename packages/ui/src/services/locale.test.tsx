// @vitest-environment jsdom
import { saveLocalePref as persistLocale, type SessionStorage } from '@kromatv/client';
import { createStyleTestHost } from '#ui/testing-style';

//
// Which language the app comes up in.
//
// The precedence is the whole of it: the signed-in account wins (so the choice
// follows a viewer between their TV and their phone), then the device override,
// then the browser. Getting the order wrong means a profile switch silently
// keeps the previous person's language, which is the kind of bug nobody reports
// and everybody notices.

import { useEffect } from 'react';
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
    accounts: { updateLanguage: vi.fn(async () => undefined) },
  };
  return client as unknown as Parameters<typeof LocaleProvider>[0]['client'] & typeof client;
}

const map = new Map<string, string>();
const deviceStore: SessionStorage = {
  getItem: (key) => map.get(key) ?? null,
  setItem: (key, value) => {
    map.set(key, value);
  },
  removeItem: (key) => {
    map.delete(key);
  },
};
const testHost = createStyleTestHost({ deviceStore });
const { render } = testHost;
const saveLocalePref = (locale: string | null) => persistLocale(locale, deviceStore);
function memoryStore() {
  map.clear();
  return map;
}

beforeEach(() => {
  memoryStore();
});

afterEach(() => {
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

  it('has told the client before a child sees the new locale', () => {
    saveLocalePref('fr');
    const client = fakeClient();
    const seen: string[] = [];
    function Watcher() {
      const locale = useLocale();
      useEffect(() => {
        seen.push(`${locale}/${client.setLocale.mock.lastCall?.[0]}`);
      }, [locale]);
      return null;
    }
    const { rerender } = render(
      <LocaleProvider client={client}>
        <Watcher />
      </LocaleProvider>,
    );

    rerender(
      <LocaleProvider client={client} accountLanguage="en">
        <Watcher />
      </LocaleProvider>,
    );

    expect(seen.at(-1)).toBe('en/en');
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

  it('saves the device language to an account that signs in after the first render', () => {
    saveLocalePref('en');
    const client = fakeClient();
    const onAccountChange = vi.fn();
    const { rerender } = render(
      <LocaleProvider client={client}>
        <Probe />
      </LocaleProvider>,
    );

    rerender(
      <LocaleProvider client={client} onAccountChange={onAccountChange}>
        <Probe />
      </LocaleProvider>,
    );

    expect(onAccountChange).toHaveBeenCalledWith('en');
    expect(client.accounts.updateLanguage).toHaveBeenCalledWith('en');
  });

  it('leaves an account that already has a language alone', () => {
    saveLocalePref('en');
    const client = fakeClient();
    const onAccountChange = vi.fn();

    render(
      <LocaleProvider client={client} accountLanguage="fr" onAccountChange={onAccountChange}>
        <Probe />
      </LocaleProvider>,
    );

    expect(onAccountChange).not.toHaveBeenCalled();
    expect(client.accounts.updateLanguage).not.toHaveBeenCalled();
  });
});
