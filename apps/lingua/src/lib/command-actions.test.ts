import { describe, expect, it, vi } from 'vitest';
import {
  accountCommands,
  addLanguageCommand,
  sendCommands,
  setupCommand,
  syncCommand,
  themeCommands,
} from './command-actions';

const act = () => ({ contributions: vi.fn(), profile: vi.fn(), signOut: vi.fn(), signIn: vi.fn() });

describe('accountCommands', () => {
  it('offers a visitor a way to sign in, and nothing else', () => {
    const actions = act();
    const rows = accountCommands(null, actions);

    void rows[0]?.run();

    expect(rows.map((row) => row.id)).toEqual(['sign-in']);
    expect(actions.signIn).toHaveBeenCalled();
  });

  it('offers a contributor their pages and a way out', () => {
    const actions = act();
    const rows = accountCommands({ login: 'ada' }, actions);

    for (const row of rows) {
      void row.run();
    }

    expect(rows.map((row) => [row.id, row.label])).toEqual([
      ['go:contributions', 'My contributions'],
      ['profile', 'Your GitHub profile'],
      ['sign-out', 'Sign out'],
    ]);
    expect(
      [actions.contributions, actions.profile, actions.signOut].map((f) => f.mock.calls.length),
    ).toEqual([1, 1, 1]);
  });
});

describe('themeCommands', () => {
  it('offers every theme but the one in force, and switches to it', () => {
    const choose = vi.fn();
    const rows = themeCommands('dark', choose);

    void rows[1]?.run();

    expect(rows.map((row) => row.label)).toEqual(['Theme: system', 'Theme: light']);
    expect(choose).toHaveBeenCalledWith('light');
  });
});

describe('page commands', () => {
  it('name what they do', () => {
    const run = vi.fn();

    expect([
      setupCommand(run).label,
      syncCommand('o/r', run).label,
      addLanguageCommand(run).label,
    ]).toEqual(['Setup & status', 'Sync o/r now', 'Add a language']);
  });

  it('offer to send only while there is something to send', () => {
    const run = vi.fn();

    expect(sendCommands('French', 0, run)).toEqual([]);
    expect(sendCommands('French', 2, run).map((row) => row.label)).toEqual([
      'Send 2 changes in French',
    ]);
  });
});
