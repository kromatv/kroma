import { beforeEach, describe, expect, it, vi } from 'vitest';
import { build } from './build';
import { cargo } from './cargo';
import { check } from './check';
import { create } from './create';
import { dev } from './dev';
import { install } from './install';
import { login } from './login';
import { plan } from './plan';
import { registry } from './registry';
import { release } from './release';
import { serve } from './serve';

const handlers = vi.hoisted(() => ({
  create: vi.fn(),
  dev: vi.fn(),
  build: vi.fn(),
  check: vi.fn(),
  install: vi.fn(),
  login: vi.fn(),
  plan: vi.fn(),
  cargo: vi.fn(),
  registry: vi.fn(),
  serve: vi.fn(),
  release: vi.fn(),
}));

vi.mock('../exit-after', () => ({ exitAfter: (work: Promise<number>) => work }));
vi.mock('../commands/create', () => ({ createCommand: handlers.create }));
vi.mock('../commands/dev', () => ({ devCommand: handlers.dev }));
vi.mock('../commands/build', () => ({ buildCommand: handlers.build }));
vi.mock('../commands/check', () => ({ checkCommand: handlers.check }));
vi.mock('../commands/install', () => ({ installCommand: handlers.install }));
vi.mock('../commands/login', () => ({ loginCommand: handlers.login }));
vi.mock('../commands/plan', () => ({ planCommand: handlers.plan }));
vi.mock('../commands/cargo', () => ({ cargoCommand: handlers.cargo }));
vi.mock('../commands/registry', () => ({ registryCommand: handlers.registry }));
vi.mock('../commands/serve', () => ({ serveCommand: handlers.serve }));
vi.mock('../commands/release', () => ({ releaseCommand: handlers.release }));

type Run = (context: { args: Record<string, unknown>; rawArgs: string[] }) => Promise<unknown>;

function runOf(command: { run?: unknown }): Run {
  return command.run as Run;
}

beforeEach(() => {
  for (const handler of Object.values(handlers)) handler.mockReset().mockResolvedValue(0);
});

describe('create', () => {
  it('hands the flags on, leaving unset ones undefined', async () => {
    await runOf(create)({ args: { id: 'tv.acme.notes', 'in-repo': true, yes: true }, rawArgs: [] });

    expect(handlers.create).toHaveBeenCalledWith({
      dir: undefined,
      id: 'tv.acme.notes',
      name: undefined,
      description: undefined,
      kind: undefined,
      storage: undefined,
      inRepo: true,
      install: true,
      yes: true,
    });
  });

  it('skips the install when asked', async () => {
    await runOf(create)({ args: { install: false, storage: false }, rawArgs: [] });

    expect(handlers.create).toHaveBeenCalledWith(
      expect.objectContaining({ install: false, storage: false }),
    );
  });
});

describe('dev', () => {
  it('hands the directory, target and server flags on', async () => {
    await runOf(dev)({ args: { dir: 'm', target: 't', server: 's', token: 'k' }, rawArgs: [] });

    expect(handlers.dev).toHaveBeenCalledWith({ dir: 'm', target: 't', server: 's', token: 'k' });
  });
});

describe('build', () => {
  it('picks the release profile by default and the dev one with debug', async () => {
    await runOf(build)({ args: { _: ['a'], out: 'o', 'skip-build': true }, rawArgs: [] });
    await runOf(build)({ args: { _: [], debug: true }, rawArgs: [] });

    expect(handlers.build.mock.calls).toEqual([
      [{ dirs: ['a'], out: 'o', target: undefined, profile: 'release-kmod', skipBuild: true }],
      [{ dirs: [], out: undefined, target: undefined, profile: 'dev', skipBuild: undefined }],
    ]);
  });
});

describe('check', () => {
  it('runs both checks unless one is switched off', async () => {
    await runOf(check)({ args: { _: ['a'] }, rawArgs: [] });
    await runOf(check)({ args: { _: [], rust: false, ts: false }, rawArgs: [] });

    expect(handlers.check.mock.calls).toEqual([
      [{ dirs: ['a'], rust: true, ts: true }],
      [{ dirs: [], rust: false, ts: false }],
    ]);
  });
});

describe('install', () => {
  it('hands the id, file and server flags on', async () => {
    await runOf(install)({ args: { id: 'i', file: 'f', from: 'd', server: 's' }, rawArgs: [] });

    expect(handlers.install).toHaveBeenCalledWith({
      id: 'i',
      file: 'f',
      from: 'd',
      server: 's',
      token: undefined,
    });
  });
});

describe('login', () => {
  it('hands the server and credentials on', async () => {
    await runOf(login)({ args: { server: 's', email: 'e', password: 'p' }, rawArgs: [] });

    expect(handlers.login).toHaveBeenCalledWith({ server: 's', email: 'e', password: 'p' });
  });
});

describe('plan', () => {
  it('hands the directories and target on', async () => {
    await runOf(plan)({ args: { _: ['a'], target: 't' }, rawArgs: [] });

    expect(handlers.plan).toHaveBeenCalledWith(['a'], 't');
  });
});

describe('cargo', () => {
  it('drops the double dash from the raw arguments', async () => {
    await runOf(cargo)({ args: {}, rawArgs: ['--', 'test', '-p', 'x'] });

    expect(handlers.cargo).toHaveBeenCalledWith(['test', '-p', 'x']);
  });
});

describe('registry', () => {
  it('hands the source, output and base on', async () => {
    await runOf(registry)({ args: { from: 'f', out: 'o', base: 'b' }, rawArgs: [] });

    expect(handlers.registry).toHaveBeenCalledWith({ from: 'f', out: 'o', base: 'b' });
  });
});

describe('serve', () => {
  it('turns the port into a number when given', async () => {
    await runOf(serve)({ args: { from: 'f', port: '8080' }, rawArgs: [] });
    await runOf(serve)({ args: {}, rawArgs: [] });

    expect(handlers.serve.mock.calls).toEqual([
      [{ from: 'f', port: 8080 }],
      [{ from: undefined, port: undefined }],
    ]);
  });
});

describe('release', () => {
  it('hands the repo and the dry-run and strict flags on', async () => {
    await runOf(release)({ args: { repo: 'o/n', 'dry-run': true }, rawArgs: [] });

    expect(handlers.release).toHaveBeenCalledWith({
      repo: 'o/n',
      published: undefined,
      from: undefined,
      out: undefined,
      dryRun: true,
      strict: false,
    });
  });
});
