import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallContext } from '../module';
import { installOverSdb } from './native';
import { connect, type InstallOptions, type SdbDevice } from './sdb';

vi.mock('./app-id', () => ({ tizenAppId: () => 'KromaTV001.KROMA' }));
vi.mock('./sdb', async (original) => ({
  ...(await original<typeof import('./sdb')>()),
  connect: vi.fn(),
}));

const lines: string[] = [];

const context = (launch = true): InstallContext => ({
  tv: {
    host: '192.168.1.31',
    platform: 'tizen',
    vendor: 'Samsung',
    name: 'Salon',
    model: 'UE50AU7172',
    developerMode: 'on',
    sideloadable: true,
    note: '',
    runtime: null,
  },
  artifact: '/out/KROMA.wgt',
  log: (line) => lines.push(line),
  launch,
  options: {},
});

let device: SdbDevice;

beforeEach(() => {
  lines.length = 0;
  device = {
    host: '192.168.1.31',
    port: 26101,
    banner: 'sdbd::UE50AU7172',
    capability: vi.fn(),
    shell: vi.fn(),
    push: vi.fn(),
    install: vi
      .fn()
      .mockResolvedValue({ verdict: 'success', code: 0, output: 'install completed' }),
    launch: vi.fn().mockResolvedValue({ verdict: 'success', code: 0, output: 'launched' }),
    uninstall: vi.fn(),
    close: vi.fn(),
  };
  vi.mocked(connect).mockResolvedValue(device);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('installOverSdb', () => {
  it('pushes the package to the set under the id the widget declares', async () => {
    await installOverSdb(context(), '/out/KROMA.wgt', 'kroma');

    expect(vi.mocked(connect)).toHaveBeenCalledWith('192.168.1.31');
    expect(vi.mocked(device.install).mock.calls[0]?.[0]).toBe('/out/KROMA.wgt');
    expect(vi.mocked(device.install).mock.calls[0]?.[1]?.appId).toBe('KromaTV001.KROMA');
  });

  it('names the set it reached before it pushes anything', async () => {
    await installOverSdb(context(), '/out/KROMA.wgt', 'kroma');

    expect(lines[0]).toBe('sdbd::UE50AU7172 on 192.168.1.31');
  });

  it('starts the app once the package is on', async () => {
    await installOverSdb(context(), '/out/KROMA.wgt', 'kroma');

    expect(vi.mocked(device.launch)).toHaveBeenCalledWith('KromaTV001.KROMA');
  });

  it('leaves the app alone when it was told to install without starting it', async () => {
    await installOverSdb(context(false), '/out/KROMA.wgt', 'kroma');

    expect(vi.mocked(device.launch)).not.toHaveBeenCalled();
  });

  it('quotes what the set said when it refused the package', async () => {
    vi.mocked(device.install).mockResolvedValue({
      verdict: 'failure',
      code: 118,
      output: 'processing result : INSTALL_ERROR [118]',
    });

    await expect(installOverSdb(context(), '/out/KROMA.wgt', 'kroma')).rejects.toThrow(
      'the install failed: processing result : INSTALL_ERROR [118]',
    );
    expect(vi.mocked(device.shell)).not.toHaveBeenCalled();
  });

  it('names the DUID to register when the set refused the certificate', async () => {
    vi.mocked(device.install).mockResolvedValue({
      verdict: 'failure',
      code: -12,
      output: 'Check certificate error : :Invalid certificate chain with certificate in signature.',
    });
    vi.mocked(device.shell).mockResolvedValue('1900A2C4D6E8\r\n');

    const installed = installOverSdb(context(), '/out/KROMA.wgt', 'kroma');

    await expect(installed).rejects.toThrow(
      'profile kroma signed it and the set refused that chain. A retail Samsung takes only certificates Samsung issued for its own DUID: the certificate command of this tool gets them, with the address of the set. The DUID of this set is 1900A2C4D6E8.',
    );
    expect(vi.mocked(device.shell).mock.calls[0]?.[0]).toBe('0 getduid');
  });

  it('still names the certificate when the set would not say its DUID', async () => {
    vi.mocked(device.install).mockResolvedValue({
      verdict: 'failure',
      code: -12,
      output: 'Invalid certificate chain with certificate in signature',
    });
    vi.mocked(device.shell).mockRejectedValue(new Error('closed'));

    const installed = installOverSdb(context(), '/out/KROMA.wgt', null);

    await expect(installed).rejects.toThrow(/^A retail Samsung takes only .* of the set\.$/);
  });

  it('says what developer mode needs when nothing answers on the bridge port', async () => {
    vi.mocked(connect).mockRejectedValue(new Error('connect ECONNREFUSED 192.168.1.31:26101'));

    await expect(installOverSdb(context(), '/out/KROMA.wgt', 'kroma')).rejects.toThrow(
      'connect ECONNREFUSED 192.168.1.31:26101. Nothing answered on 26101: developer mode has to be on, naming this computer as the host PC, and the set rebooted since',
    );
  });

  it('quotes a failure to connect that is not an error object', async () => {
    vi.mocked(connect).mockRejectedValue('socket hang up');

    await expect(installOverSdb(context(), '/out/KROMA.wgt', 'kroma')).rejects.toThrow(
      /^socket hang up\. Nothing answered on 26101/,
    );
  });

  it('closes the connection even when the push threw', async () => {
    vi.mocked(device.install).mockRejectedValue(new Error('the set went away'));

    await expect(installOverSdb(context(), '/out/KROMA.wgt', 'kroma')).rejects.toThrow(
      'the set went away',
    );
    expect(vi.mocked(device.close)).toHaveBeenCalledOnce();
  });

  it('reports the push every fifth of the way, and not on every packet', async () => {
    vi.mocked(device.install).mockImplementation(
      async (_artifact: string, { onProgress }: InstallOptions) => {
        for (const sent of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) onProgress?.(sent, 100);
        return { verdict: 'success', code: 0, output: 'install completed' };
      },
    );

    await installOverSdb(context(), '/out/KROMA.wgt', 'kroma');

    expect(lines.slice(1)).toEqual([
      'pushing KROMA.wgt, 20%',
      'pushing KROMA.wgt, 40%',
      'pushing KROMA.wgt, 60%',
      'pushing KROMA.wgt, 80%',
      'pushing KROMA.wgt, 100%',
    ]);
  });

  it('reports nothing about a push the set gave no total for', async () => {
    vi.mocked(device.install).mockImplementation(
      async (_artifact: string, { onProgress }: InstallOptions) => {
        onProgress?.(0, 0);
        return { verdict: 'success', code: 0, output: 'install completed' };
      },
    );

    await installOverSdb(context(), '/out/KROMA.wgt', 'kroma');

    expect(lines.slice(1)).toEqual([]);
  });
});
