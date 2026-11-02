import type { MessageKey } from '@kromatv/i18n';
import type { ModulePermissions } from '@kromatv/client/modules';
import { describe, expect, it } from 'vitest';
import { permissionLines } from '#web/features/admin/module-permissions';

const spelled = (key: MessageKey, params?: Record<string, string>) =>
  params ? `${key} ${JSON.stringify(params)}` : key;

const lines = (permissions: ModulePermissions) => permissionLines(permissions, spelled);

describe('permissionLines', () => {
  it('asks for nothing when the block is empty', () => {
    expect(lines({})).toEqual([]);
  });

  it('says where a connection may go and why', () => {
    const [line] = lines({ net: { connect: [{ purpose: 'indexer', to: ['public', 'lan'] }] } });

    expect(line?.text).toContain('admin.permissionToPublic, admin.permissionToLan');
    expect(line?.text).toContain('indexer');
  });

  it('names a host as it is written', () => {
    const [line] = lines({ net: { connect: [{ purpose: 'metadata', to: ['api.example'] }] } });

    expect(line?.text).toContain('api.example');
  });

  it('never prints the name of the setting behind a destination', () => {
    const [line] = lines({ net: { connect: [{ purpose: 'seal', to: ['setting:vpnCheckUrl'] }] } });

    expect(line?.text).toContain('admin.permissionToSetting');
    expect(line?.text).not.toContain('vpnCheckUrl');
  });

  it('puts the host network first and marks it as dangerous', () => {
    const [first, second] = lines({
      net: { host: true, connect: [{ purpose: 'peers', to: ['public'] }] },
    });

    expect(first?.danger).toBe(true);
    expect(first?.text).toBe('admin.permissionHostNetwork');
    expect(second?.danger).toBe(false);
  });

  it('lists what it reads, writes, runs and reads from the environment', () => {
    const said = lines({
      fs: { read: ['media'], write: ['downloads'] },
      run: ['ffmpeg'],
      env: ['KROMA_X'],
    }).map((line) => line.text);

    expect(said).toEqual([
      'admin.permissionRead {"roots":"admin.permissionRootMedia"}',
      'admin.permissionWrite {"roots":"admin.permissionRootDownloads"}',
      'admin.permissionRun {"programs":"ffmpeg"}',
      'admin.permissionEnv {"names":"KROMA_X"}',
    ]);
  });
});
