// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CommandDef,
  CommandMenuProvider,
  useCommandMenu,
  useCommandQuery,
  useCommands,
  useContributedCommands,
} from './command-menu';

const mocks = vi.hoisted(() => ({ user: { id: 'viewer', permissions: [] } as object | null }));
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ user: mocks.user }) }));

const CHORD = { key: 'k', ctrlKey: true };

const Menu = () => <div>the menu</div>;

const loads = () => vi.fn().mockResolvedValue(Menu);

const command = (id: string): CommandDef => ({ id, label: id, run: () => {} });

const settle = () => act(async () => {});

async function chord(): Promise<boolean> {
  const reachedTheBrowser = fireEvent.keyDown(document, CHORD);
  await settle();
  return reachedTheBrowser;
}

const isOpen = () => screen.queryByText('the menu') !== null;

function Contributes({
  commands,
  shared,
}: Readonly<{
  commands: Parameters<typeof useCommands>[0];
  shared?: Parameters<typeof useCommands>[1];
}>) {
  useCommands(commands, shared);
  return null;
}

function Listed() {
  const ids = useContributedCommands().map(({ id, group }) => (group ? `${group}/${id}` : id));
  return <output>{ids.join(',')}</output>;
}

function OpenButton() {
  const { open, close } = useCommandMenu();
  return (
    <>
      <button type="button" onClick={open}>
        open it
      </button>
      <button type="button" onClick={close}>
        close it
      </button>
    </>
  );
}

function provider(children: ReactNode, load = loads()) {
  return <CommandMenuProvider load={load}>{children}</CommandMenuProvider>;
}

const listed = () => screen.getByRole('status').textContent;

beforeEach(() => {
  mocks.user = { id: 'viewer', permissions: [] };
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64)');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'fullscreenElement');
});

describe('the command menu key', () => {
  it('opens the menu for a signed-in viewer', async () => {
    render(provider(null));

    await chord();

    expect(isOpen()).toBe(true);
  });

  it('leaves the key to the open menu, whose action panel answers it', async () => {
    render(provider(null));

    await chord();
    await chord();

    expect(isOpen()).toBe(true);
  });

  it('leaves the key to the browser before sign-in', async () => {
    mocks.user = null;
    render(provider(null));

    const reachedTheBrowser = await chord();

    expect(reachedTheBrowser).toBe(true);
    expect(isOpen()).toBe(false);
  });

  it('does not open over a dialog that is already up', async () => {
    render(provider(<div role="dialog" aria-modal="true" />));

    await chord();

    expect(isOpen()).toBe(false);
  });

  it('does not open during fullscreen playback, where nothing outside the player can draw', async () => {
    render(provider(null));

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.body,
    });

    await chord();

    expect(isOpen()).toBe(false);
  });
});

describe('useCommandMenu', () => {
  it('opens the menu from a control', async () => {
    render(provider(<OpenButton />));

    fireEvent.click(screen.getByRole('button', { name: 'open it' }));
    await settle();

    expect(isOpen()).toBe(true);
  });
});

describe('loading the menu', () => {
  it('warms it a moment after sign-in, ahead of any press', async () => {
    vi.useFakeTimers();
    const load = loads();
    render(provider(null, load));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads nothing for a viewer who has not signed in', async () => {
    vi.useFakeTimers();
    mocks.user = null;
    const load = loads();
    render(provider(null, load));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(load).not.toHaveBeenCalled();
  });

  it('draws a warmed menu in the same turn as the press, so nothing typed is lost', async () => {
    vi.useFakeTimers();
    render(provider(null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    fireEvent.keyDown(document, CHORD);

    expect(isOpen()).toBe(true);
  });

  it('loads it on the spot when pressed before it was warmed', async () => {
    const load = loads();
    render(provider(null, load));

    await chord();

    expect(load).toHaveBeenCalledTimes(1);
    expect(isOpen()).toBe(true);
  });

  it('says why when it will not load, and leaves the page alone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(provider(<p>the page</p>, vi.fn().mockRejectedValue(new Error('chunk gone'))));

    await chord();

    expect(warn).toHaveBeenCalled();
    expect(screen.getByText('the page')).toBeTruthy();
  });

  it('tries again on the next press after a load failed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = vi.fn().mockRejectedValueOnce(new Error('chunk gone')).mockResolvedValue(Menu);
    render(provider(<OpenButton />, load));

    fireEvent.click(screen.getByRole('button', { name: 'open it' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'close it' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'open it' }));
    await settle();

    expect(isOpen()).toBe(true);
  });
});

describe('useCommandQuery', () => {
  function QueryBox() {
    const { open, close, setQuery } = useCommandMenu();
    return (
      <>
        <output>{useCommandQuery()}</output>
        <button type="button" onClick={open}>
          open
        </button>
        <button type="button" onClick={close}>
          close
        </button>
        <button type="button" onClick={() => setQuery('dune')}>
          type
        </button>
      </>
    );
  }

  const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
  const typed = () => screen.getByRole('status').textContent;

  it('reads what is typed', () => {
    render(provider(<QueryBox />));

    press('type');

    expect(typed()).toBe('dune');
  });

  it('forgets it when the menu closes, so the next open starts clean', () => {
    render(provider(<QueryBox />));

    press('open');
    press('type');
    press('close');

    expect(typed()).toBe('');
  });

  it('reads nothing without a provider', () => {
    render(<QueryOnly />);

    expect(typed()).toBe('');
  });

  function QueryOnly() {
    return <output>{useCommandQuery()}</output>;
  }
});

describe('useCommands', () => {
  it('lists a screen’s commands while it is mounted', () => {
    render(
      provider(
        <>
          <Contributes commands={[command('a')]} />
          <Listed />
        </>,
      ),
    );

    expect(listed()).toBe('a');
  });

  it('skips a row that does not apply', () => {
    render(
      provider(
        <>
          <Contributes commands={[false, null, undefined, '', command('kept')]} />
          <Listed />
        </>,
      ),
    );

    expect(listed()).toBe('kept');
  });

  it('gives every row what they share', () => {
    render(
      provider(
        <>
          <Contributes commands={[command('a'), command('b')]} shared={{ group: 'More' }} />
          <Listed />
        </>,
      ),
    );

    expect(listed()).toBe('More/a,More/b');
  });

  it('lets a row keep its own value over what they share', () => {
    const own = { ...command('a'), group: 'Own' };
    render(
      provider(
        <>
          <Contributes commands={[own, command('b')]} shared={{ group: 'More' }} />
          <Listed />
        </>,
      ),
    );

    expect(listed()).toBe('Own/a,More/b');
  });

  it('lists two calls in the order they were made, so one hook can make one per heading', () => {
    function TwoHeadings() {
      useCommands([command('a')], { group: 'First' });
      useCommands([command('b')], { group: 'Second' });
      return null;
    }
    render(
      provider(
        <>
          <TwoHeadings />
          <Listed />
        </>,
      ),
    );

    expect(listed()).toBe('First/a,Second/b');
  });

  it('takes them away when the screen goes', () => {
    const tree = (mounted: boolean, load: () => Promise<typeof Menu>) =>
      provider(
        <>
          {mounted ? <Contributes commands={[command('a')]} /> : null}
          <Listed />
        </>,
        load as ReturnType<typeof loads>,
      );
    const load = loads();
    const { rerender } = render(tree(true, load));

    rerender(tree(false, load));

    expect(listed()).toBe('');
  });

  it('follows a screen whose commands change', () => {
    const load = loads();
    const tree = (id: string) =>
      provider(
        <>
          <Contributes commands={[command(id)]} />
          <Listed />
        </>,
        load,
      );
    const { rerender } = render(tree('before'));

    rerender(tree('after'));

    expect(listed()).toBe('after');
  });

  it('keeps two screens apart', () => {
    render(
      provider(
        <>
          <Contributes commands={[command('a')]} />
          <Contributes commands={[command('b')]} />
          <Listed />
        </>,
      ),
    );

    expect(listed()).toBe('a,b');
  });

  it('does nothing without a provider, so a screen renders on its own in a test', () => {
    render(<Contributes commands={[command('a')]} />);

    expect(screen.queryByText('the menu')).toBeNull();
  });
});
