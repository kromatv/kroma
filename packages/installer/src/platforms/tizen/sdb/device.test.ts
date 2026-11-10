import { randomBytes, randomInt } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installCommands, PACKAGE_TEMP_DIR, packageIdOf } from './commands';
import { connect, devices, type SdbDevice } from './device';
import {
  applicationId,
  capabilityPayload,
  deviceName,
  type FakeDevice,
  fakeDevice,
  toolPath,
} from './fake-device.fixture';
import { SYNC_HEADER_BYTES, syncRequest } from './sync';

const PATIENT_MS = 200;
const SHELL = 'shell:';

interface TelevisionOptions {
  capability?: Record<string, string>;
  answers?: Record<string, string>;
  shells?: string;
}

const televisions: FakeDevice[] = [];
const attached: SdbDevice[] = [];
const directories: string[] = [];

const localFile = () => {
  const directory = mkdtempSync(join(tmpdir(), 'kroma-sdb-'));
  directories.push(directory);
  const path = join(directory, `KROMA-${randomInt(1000)}.wgt`);
  writeFileSync(path, randomBytes(64));
  return path;
};

const television = async ({
  capability = { sdk_toolpath: toolPath() },
  answers = {},
  shells = SHELL,
}: TelevisionOptions) => {
  const set = await fakeDevice();
  televisions.push(set);
  const commands: string[] = [];
  const pushed: Buffer[] = [];
  set.serve('capability:', (session) => session.end(capabilityPayload(capability)));
  set.serve('sync:', async (session) => {
    for (;;) {
      const message = await session.read();
      pushed.push(message);
      if (message.subarray(0, 4).toString('ascii') === 'DONE') {
        session.write(syncRequest('OKAY', 0));
      }
    }
  });
  set.serve(shells, (session) => {
    const command = session.service.slice(SHELL.length);
    commands.push(command);
    const match = Object.entries(answers).find(([fragment]) => command.includes(fragment));
    session.end(match?.[1] ?? 'sh: command not found');
  });
  const device = await connect(set.host, set.port);
  attached.push(device);
  return { set, device, commands, pushed };
};

const destination = (pushed: readonly Buffer[]): string =>
  (pushed[0] ?? Buffer.alloc(SYNC_HEADER_BYTES))
    .subarray(SYNC_HEADER_BYTES)
    .toString('utf8')
    .split(',')[0] ?? '';

afterEach(async () => {
  for (const device of attached.splice(0)) device.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  await Promise.all(televisions.splice(0).map((set) => set.close()));
});

describe('a connected device', () => {
  it('keeps the banner the set introduced itself with', async () => {
    const { set, device } = await television({});

    expect(device.banner).toBe(set.banner);
  });

  it('answers with what a command printed', async () => {
    const { device } = await television({ answers: { getversion: '5.5\n' } });

    expect(await device.shell('/usr/bin/profile_command getversion')).toBe('5.5\n');
  });

  it('asks the set what it can do only once', async () => {
    const platformVersion = `8.${randomInt(9)}`;
    const { set, device } = await television({ capability: { platform_version: platformVersion } });

    const [first, second] = [await device.capability(), await device.capability()];

    expect([first.platform_version, second.platform_version]).toEqual([
      platformVersion,
      platformVersion,
    ]);
    expect(set.opened.filter((service) => service === 'capability:')).toHaveLength(1);
  });

  it('pushes a file to the path it was handed', async () => {
    const { device, pushed } = await television({});
    const remote = `${toolPath()}/KROMA.wgt`;

    await device.push(localFile(), remote);

    expect(destination(pushed)).toBe(remote);
  });
});

describe('installing a package', () => {
  it('puts it in the directory the set advertises', async () => {
    const advertised = toolPath();
    const { device, pushed } = await television({ capability: { sdk_toolpath: advertised } });
    const artifact = localFile();

    await device.install(artifact, { appId: applicationId() });

    expect(destination(pushed)).toBe(`${advertised}/${basename(artifact)}`);
  });

  it('asks pkgcmd where packages go when the set advertises no path', async () => {
    const queried = toolPath();
    const { device, pushed } = await television({ capability: {}, answers: { pkgcmd: queried } });
    const artifact = localFile();

    await device.install(artifact, { appId: applicationId() });

    expect(destination(pushed)).toBe(`${queried}/${basename(artifact)}`);
  });

  it('falls back to the stock temporary path when nothing answers', async () => {
    const { device, pushed } = await television({ capability: {} });
    const artifact = localFile();

    await device.install(artifact, { appId: applicationId() });

    expect(destination(pushed)).toBe(`${PACKAGE_TEMP_DIR}/${basename(artifact)}`);
  });

  it('stops at the first command shape the set accepts', async () => {
    const { device, commands } = await television({
      answers: { vd_appinstall: 'install completed' },
    });

    const result = await device.install(localFile(), { appId: applicationId() });

    expect(result.verdict).toBe('success');
    expect(commands.filter((command) => command.includes('appinstall'))).toHaveLength(1);
  });

  it('falls through to pkgcmd when the dispatcher knows neither shape', async () => {
    const advertised = toolPath();
    const { device, commands } = await television({
      capability: { sdk_toolpath: advertised },
      answers: { 'pkgcmd -i': 'processing result : OK [0] succeeded' },
    });
    const appId = applicationId();
    const artifact = localFile();

    const result = await device.install(artifact, { appId });

    expect(result).toMatchObject({ verdict: 'success', code: 0 });
    expect(commands.slice(0, 3)).toEqual(
      installCommands(packageIdOf(appId), `${advertised}/${basename(artifact)}`),
    );
  });

  it('reports a refusal rather than trying the next shape', async () => {
    const { device, commands } = await television({
      answers: { vd_appinstall: 'processing result : FAIL [62] installation failed' },
    });

    const result = await device.install(localFile(), { appId: applicationId() });

    expect(result).toMatchObject({ verdict: 'failure', code: 62 });
    expect(commands.filter((command) => command.includes('appinstall'))).toHaveLength(1);
  });

  it('names the package rather than the application it holds', async () => {
    const advertised = toolPath();
    const { device, commands } = await television({
      capability: { sdk_toolpath: advertised },
      answers: { vd_appinstall: 'install completed' },
    });
    const appId = applicationId();
    const artifact = localFile();

    await device.install(artifact, { appId });

    expect(commands[0]).toBe(
      `0 vd_appinstall ${packageIdOf(appId)} ${advertised}/${basename(artifact)}`,
    );
  });

  it('removes the package it pushed, even when the install failed', async () => {
    const { device, commands, pushed } = await television({
      answers: { vd_appinstall: 'installation failed', rmfile: '' },
    });

    await device.install(localFile(), { appId: applicationId() });

    expect(commands).toContain(`0 rmfile "${destination(pushed)}"`);
  });

  it('reaches for /bin/rm when the dispatcher has no rmfile', async () => {
    const { device, commands, pushed } = await television({
      answers: {
        vd_appinstall: 'install completed',
        rmfile: 'sh: command not found',
        '/bin/rm': '',
      },
    });

    await device.install(localFile(), { appId: applicationId() });

    expect(commands).toContain(`/bin/rm -f "${destination(pushed)}"`);
  });

  it('installs anyway when the set will not open a shell to clean up', async () => {
    const { device } = await television({
      shells: `${SHELL}0 vd_appinstall`,
      answers: { vd_appinstall: 'install completed' },
    });

    const result = await device.install(localFile(), { appId: applicationId() });

    expect(result.verdict).toBe('success');
  });

  it('logs every command it tried and what came back', async () => {
    const lines: string[] = [];
    const { device } = await television({ answers: { vd_appinstall: 'install completed' } });
    const log = (line: string) => void lines.push(line);

    await device.install(localFile(), { appId: applicationId(), log });

    expect(lines.filter((line) => line.startsWith('> '))).toHaveLength(1);
    expect(lines.at(-1)).toMatch(/ success \[0\]: install completed$/);
  });
});

describe('launching and uninstalling', () => {
  it('tries every launch shape until one answers', async () => {
    const { device, commands } = await television({ answers: { '0 execute': 'result: launched' } });
    const appId = applicationId();

    const result = await device.launch(appId);

    expect(result.verdict).toBe('success');
    expect(commands).toEqual([`0 was_execute ${appId}`, `0 execute ${appId}`]);
  });

  it('uninstalls by package id', async () => {
    const { device, commands } = await television({
      answers: { vd_appuninstall: 'uninstall completed' },
    });
    const packageId = applicationId().split('.')[0] ?? '';

    const result = await device.uninstall(packageId);

    expect(result.verdict).toBe('success');
    expect(commands).toEqual([`0 vd_appuninstall ${packageId}`]);
  });
});

describe('looking for televisions', () => {
  it('reads the name, profile and platform a set advertises', async () => {
    const name = deviceName();
    const { set } = await television({
      capability: { device_name: name, profile_name: 'tv', platform_version: '8.0' },
    });

    expect(await devices([set.host], set.port)).toEqual([
      {
        host: set.host,
        port: set.port,
        reachable: true,
        name,
        profile: 'tv',
        platformVersion: '8.0',
      },
    ]);
  });

  it('leaves blank what a set does not advertise', async () => {
    const { set } = await television({ capability: {} });

    expect(await devices([set.host], set.port)).toEqual([
      {
        host: set.host,
        port: set.port,
        reachable: true,
        name: '',
        profile: '',
        platformVersion: '',
      },
    ]);
  });

  it('marks a host nothing answers on as unreachable', async () => {
    const set = await fakeDevice();
    await set.close();

    expect(await devices([set.host], set.port, { timeoutMs: PATIENT_MS })).toEqual([
      {
        host: set.host,
        port: set.port,
        reachable: false,
        name: '',
        profile: '',
        platformVersion: '',
      },
    ]);
  });
});
