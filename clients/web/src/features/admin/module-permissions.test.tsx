// @vitest-environment jsdom
import type { ModulePermissions } from '@kromatv/client/modules';
import { describe, expect, it } from 'vitest';
import {
  type PermissionCategory,
  permissionGroups,
  type PermissionSource,
  tileGroups,
} from '#web/features/admin/module-permissions';
import { englishT } from '#web/features/admin/module-permissions.fixture';

const t = englishT();

const groups = (source: Partial<PermissionSource> & { permissions?: ModulePermissions }) =>
  permissionGroups({ permissions: {}, ...source }, t);

function group(source: Parameters<typeof groups>[0], category: PermissionCategory) {
  const found = groups(source).find((one) => one.category === category);
  if (!found) throw new Error(`no ${category} group`);
  return found;
}

describe('permissionGroups', () => {
  it('says nothing for a module that declares nothing', () => {
    expect(groups({})).toEqual([]);
  });

  it('puts what reaches past the isolation first, and marks only that as extended', () => {
    const said = groups({
      permissions: {
        net: { host: true, connect: [{ purpose: 'peers', to: ['public'] }] },
        run: ['rqbit'],
      },
    }).map(({ category, extended }) => [category, extended]);

    expect(said).toEqual([
      ['run', true],
      ['host', true],
      ['internet', false],
    ]);
  });

  it('says the server decodes audio for a module that asks it, inside its isolation', () => {
    const media = group({ permissions: { media: ['decode'] } }, 'media');

    expect(media).toMatchObject({
      summary: 'Has the server decode the audio of files it can read',
      extended: false,
    });
  });

  it('says where a connection goes and why when it has one purpose', () => {
    const internet = group(
      {
        permissions: {
          net: {
            connect: [{ purpose: 'metadata', to: ['api.themoviedb.org'], ports: [443] }],
          },
        },
      },
      'internet',
    );

    expect(internet.summary).toBe(
      'Connects to api.themoviedb.org to fetch film and series details',
    );
    expect(internet.details).toEqual([
      { text: 'Fetch film and series details', hint: 'api.themoviedb.org, port 443' },
    ]);
  });

  it('says any website once, whatever the purposes behind it', () => {
    const internet = group(
      {
        permissions: {
          net: {
            connect: [
              { purpose: 'peers', to: ['public', 'lan'] },
              { purpose: 'binary-download', to: ['github.com', '*.githubusercontent.com'] },
            ],
          },
        },
      },
      'internet',
    );

    expect(internet.summary).toBe('Connects to any website');
    expect(internet.details.map((detail) => detail.hint)).toEqual([
      'Any website',
      'github.com and *.githubusercontent.com',
    ]);
  });

  it('drops a wildcard in the summary and keeps the host as written in the sheet', () => {
    const internet = group(
      {
        permissions: {
          net: {
            connect: [
              { purpose: 'model-download', to: ['huggingface.co', '*.huggingface.co', '*.hf.co'] },
            ],
          },
        },
      },
      'internet',
    );

    expect(internet.summary).toBe('Connects to huggingface.co and hf.co to download its models');
    expect(internet.details[0]?.hint).toBe('huggingface.co, *.huggingface.co and *.hf.co');
  });

  it('never names the setting behind a destination', () => {
    const internet = group(
      {
        permissions: { net: { connect: [{ purpose: 'seal-check', to: ['setting:vpnCheckUrl'] }] } },
      },
      'internet',
    );

    expect(JSON.stringify(internet)).not.toContain('vpnCheckUrl');
    expect(internet.summary).toBe(
      'Connects to the address you set to check that traffic goes through the VPN',
    );
  });

  it('tells the local network apart from the internet', () => {
    const said = groups({
      permissions: {
        net: { connect: [{ purpose: 'roku', to: ['lan'], ports: [8060] }], discovery: ['ssdp'] },
      },
    });

    expect(said.map((one) => one.category)).toEqual(['lan']);
    expect(said[0]?.summary).toBe('Talks to the devices on your network');
    expect(said[0]?.details).toEqual([
      { text: 'Control Roku televisions', hint: 'Port 8060' },
      { text: 'Look for devices (SSDP)' },
    ]);
  });

  it('says a module that only announces itself makes itself known', () => {
    expect(group({ permissions: { net: { discovery: ['mdns'] } } }, 'lan').summary).toBe(
      'Makes itself known on your network',
    );
  });

  it('says why it accepts incoming connections, on a port the operator sets', () => {
    const listen = group(
      { permissions: { net: { listen: [{ purpose: 'peers', port: 'setting:rqbitPort' }] } } },
      'listen',
    );

    expect(listen.summary).toBe('Accepts incoming connections to exchange with other peers');
    expect(listen.details[0]?.hint).toBe('The port you set');
  });

  it('leaves its own folder out of your files', () => {
    expect(
      groups({ permissions: { fs: { read: ['module', 'temp'], write: ['module'] } } }),
    ).toEqual([]);
  });

  it('says what it changes in your files before what it only reads', () => {
    const files = group(
      { permissions: { fs: { read: ['media', 'downloads'], write: ['downloads'] } } },
      'files',
    );

    expect(files.summary).toBe('Changes your downloads and reads your library');
    expect(files.details).toEqual([
      { text: 'Your library', hint: 'Read only' },
      { text: 'Your downloads', hint: 'Read and change' },
    ]);
  });

  it("tells a pinned program from the server's own once it knows the helpers", () => {
    const installed = group(
      { permissions: { run: ['rqbit', 'curl'] }, helpers: { rqbit: {} } },
      'run',
    );
    const offered = group({ permissions: { run: ['rqbit'] } }, 'run');

    expect(installed.summary).toBe('Runs rqbit and curl');
    expect(installed.details).toEqual([
      { text: 'rqbit', hint: 'Verified version, shipped with the module' },
      { text: 'curl', hint: 'The one installed on the server' },
    ]);
    expect(offered.details).toEqual([]);
  });

  it('counts the downloads an official module declares as its files, not as extended access', () => {
    const fs = { read: ['downloads' as const], write: ['downloads' as const] };

    const official = groups({ permissions: { fs }, official: true });

    expect(official.map(({ category, extended }) => [category, extended])).toEqual([
      ['files', false],
    ]);
  });

  it('says whether a kind of access reads or changes, where that applies', () => {
    const said = groups({
      permissions: {
        fs: { read: ['media'] },
        net: { connect: [{ purpose: 'peers', to: ['public'] }] },
      },
      storage: { core: { read: ['users.email'], write: ['downloads'] } },
    }).map(({ category, access }) => [category, access]);

    expect(said).toEqual([
      ['accounts', 'read'],
      ['files', 'read'],
      ['internet', null],
      ['data', 'write'],
    ]);
  });

  it('says a tile in a few words: the first name and how many others', () => {
    const accounts = group(
      { storage: { core: { read: ['users.email', 'users.username', 'users.language'] } } },
      'accounts',
    );
    const files = group({ permissions: { fs: { write: ['media', 'downloads'] } } }, 'files');
    const internet = group(
      { permissions: { net: { connect: [{ purpose: 'metadata', to: ['api.themoviedb.org'] }] } } },
      'internet',
    );

    expect(accounts.brief).toBe('Email address and 2 others');
    expect(accounts.summary).toBe('Email address, username and 1 other');
    expect(files.brief).toBe('Library and downloads');
    expect(internet.brief).toBe('api.themoviedb.org');
  });

  it('shows as tiles the four weightiest kinds of access that stay inside the isolation', () => {
    const tiles = tileGroups(
      groups({
        permissions: {
          run: ['rqbit'],
          net: {
            host: true,
            connect: [{ purpose: 'peers', to: ['public', 'lan'] }],
            listen: [{ purpose: 'peers', port: 'setting:rqbitPort' }],
          },
          fs: { read: ['downloads'], write: ['downloads'] },
        },
        storage: { core: { read: ['users.email', 'downloads'] } },
        settings: { read: ['rqbitPort'] },
      }),
    ).map((one) => one.category);

    expect(tiles).toEqual(['accounts', 'files', 'internet', 'listen']);
  });
});
