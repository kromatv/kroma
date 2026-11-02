// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { permissionGroups, type PermissionSource } from '#web/features/admin/module-permissions';
import { englishT } from '#web/features/admin/module-permissions.fixture';

const t = englishT();

function only(source: Omit<PermissionSource, 'permissions'> & Partial<PermissionSource>) {
  const [group, ...rest] = permissionGroups({ permissions: {}, ...source }, t);
  expect(rest).toEqual([]);
  if (!group) throw new Error('no group');
  return group;
}

describe('account data', () => {
  it('leads with what weighs most and counts the rest', () => {
    const accounts = only({
      storage: { core: { read: ['users.id', 'users.language', 'users.email', 'users.username'] } },
    });

    expect(accounts.category).toBe('accounts');
    expect(accounts.summary).toBe('Email address, username and 2 others');
    expect(accounts.details).toEqual([
      { text: 'Email address, username, language and account ID', hint: 'Read only' },
    ]);
  });

  it('counts a column the core has no word for without naming it in the summary', () => {
    const accounts = only({ storage: { core: { read: ['users.email', 'users.secret_thing'] } } });

    expect(accounts.summary).toBe('Email address and 1 other');
    expect(accounts.details[0]?.text).toBe('Email address and users.secret_thing');
  });

  it('counts the history a module reads as data about people', () => {
    expect(only({ storage: { core: { read: ['play_history', 'progress'] } } }).summary).toBe(
      'Watch history',
    );
  });
});

describe('server data', () => {
  it('groups the tables by what the module may do with them', () => {
    const data = only({
      storage: {
        core: { read: ['downloads', 'requests', 'items', 'shows'], write: ['downloads', 'wanted'] },
      },
    });

    expect(data.category).toBe('data');
    expect(data.summary).toBe('Download queue, requests and 2 others');
    expect(data.details).toEqual([
      { text: 'Download queue', hint: 'Read and change' },
      { text: 'Followed titles', hint: 'Change only' },
      { text: 'Requests and catalog', hint: 'Read only' },
    ]);
  });

  it('says how many tables when the core has a word for none of them', () => {
    expect(only({ storage: { core: { read: ['whisper_jobs'] } } }).summary).toBe(
      "1 table of the server's database",
    );
  });
});

describe('server settings', () => {
  it('names the topics an operator knows, never a raw key in the summary', () => {
    const settings = only({
      settings: {
        read: ['namingCase', 'namingMovieFile', 'rqbitPort', 'vpnWgConfig', 'somethingNew'],
        write: ['namingCase'],
      },
    });

    expect(settings.summary).toBe('File naming, download engine and 2 others');
    expect(settings.summary).not.toContain('somethingNew');
    expect(settings.details).toEqual([
      { text: 'File naming', hint: 'Read and change' },
      {
        text: 'Download engine, WireGuard configuration (with its private key) and somethingNew',
        hint: 'Read only',
      },
    ]);
  });

  it('lists the environment variables it is handed beside the settings', () => {
    const settings = only({ permissions: { env: ['KROMA_EMBED_MODEL_DIR'] } });

    expect(settings.summary).toBe("Reads one of the server's environment variables");
    expect(settings.details).toEqual([
      { text: 'KROMA_EMBED_MODEL_DIR', hint: 'Server environment variable' },
    ]);
  });
});
