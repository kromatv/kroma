import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deployTo } from '../install/deploy';
import type { ModuleOptions } from '../modules/module';
import { television } from '../television.fixture';
import { installSets } from './install-sets';

interface Task {
  title: string;
  lines: string[];
  done: string[];
  failed: string[];
}

const { tasks } = vi.hoisted(() => ({ tasks: [] as Task[] }));

vi.mock('../install/deploy', () => ({ deployTo: vi.fn() }));
vi.mock('@clack/prompts', () => ({
  taskLog: ({ title }: { title: string }) => {
    const task: Task = { title, lines: [], done: [], failed: [] };
    tasks.push(task);
    return {
      message: (line: string) => task.lines.push(line),
      success: (line: string) => task.done.push(line),
      error: (line: string) => task.failed.push(line),
    };
  },
}));

const salon = television();
const cuisine = television({ host: '192.168.1.11', name: 'Cuisine', platform: 'webos' });

const noOptions: ReadonlyMap<string, ModuleOptions> = new Map();

beforeEach(() => {
  tasks.length = 0;
  vi.mocked(deployTo).mockReset();
});

describe('installSets', () => {
  it('installs onto every set it is given and reports nothing failed', async () => {
    vi.mocked(deployTo).mockResolvedValue();

    const failed = await installSets([salon, cuisine], { launch: true, moduleOptions: noOptions });

    expect(failed).toEqual([]);
    expect(tasks.map((task) => task.title)).toEqual([
      `${salon.name} (${salon.host})`,
      'Cuisine (192.168.1.11)',
    ]);
  });

  it('carries on to the next set after one fails, and returns only the one that did', async () => {
    vi.mocked(deployTo).mockRejectedValueOnce(new Error('no signing profile')).mockResolvedValue();

    const failed = await installSets([salon, cuisine], { launch: true, moduleOptions: noOptions });

    expect(failed).toEqual([salon]);
    expect(tasks[0]?.failed).toEqual([`${salon.name}: no signing profile`]);
    expect(tasks[1]?.done).toEqual(['Cuisine: installed and launched']);
  });

  it('says what was thrown even when it was never an Error', async () => {
    vi.mocked(deployTo).mockRejectedValue('sdb: device unauthorized');

    await installSets([salon], { launch: true, moduleOptions: noOptions });

    expect(tasks[0]?.failed).toEqual([`${salon.name}: sdb: device unauthorized`]);
  });

  it('claims only an install when it was told not to launch', async () => {
    vi.mocked(deployTo).mockResolvedValue();

    await installSets([salon], { launch: false, moduleOptions: noOptions });

    expect(tasks[0]?.done).toEqual([`${salon.name}: installed`]);
  });

  it('hands each set the artifact, the source and its own module options', async () => {
    vi.mocked(deployTo).mockResolvedValue();

    await installSets([salon, cuisine], {
      artifact: '/out/KROMA.wgt',
      source: 'canary',
      launch: true,
      moduleOptions: new Map([['192.168.1.11', { passphrase: 'ABCDEF' }]]),
    });

    expect(vi.mocked(deployTo).mock.calls[0]?.[1]).toMatchObject({
      artifact: '/out/KROMA.wgt',
      source: 'canary',
      launch: true,
      moduleOptions: undefined,
    });
    expect(vi.mocked(deployTo).mock.calls[1]?.[1]).toMatchObject({
      moduleOptions: { passphrase: 'ABCDEF' },
    });
  });

  it('shows what the install said as it said it', async () => {
    vi.mocked(deployTo).mockImplementation(async (_tv, options) => {
      options.log('sdb connect 192.168.1.10');
      options.log('installed KROMA');
    });

    await installSets([salon], { launch: true, moduleOptions: noOptions });

    expect(tasks[0]?.lines).toEqual(['sdb connect 192.168.1.10', 'installed KROMA']);
  });
});
