import { describe, expect, it } from 'vitest';
import {
  commandNames,
  idOf,
  installedEditors,
  launcherOf,
  nameOf,
  onPath,
  resolveFile,
  runnable,
  type Where,
  within,
} from './editors.ts';

function machine(files: string[], platform = 'darwin', path = '/usr/bin'): Where {
  const there = new Set(files);
  return { path, platform, exists: (file) => there.has(file) };
}

const SUBL = '/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl';

describe('what a command is called', () => {
  it('is the command itself everywhere but Windows', () => {
    expect(commandNames('zed', 'darwin')).toEqual(['zed']);
  });

  it('falls back to the extensions Windows ships with where PATHEXT says nothing', () => {
    expect(commandNames('code', 'win32')).toEqual(['code.com', 'code.exe', 'code.bat', 'code.cmd']);
  });

  it('wears every extension Windows counts as runnable', () => {
    expect(commandNames('code', 'win32', '.EXE;.CMD')).toEqual(['code.exe', 'code.cmd']);
  });

  it('leaves an executable that already names its extension alone', () => {
    expect(commandNames('Code.exe', 'win32', '.EXE;.CMD')).toEqual(['Code.exe']);
  });
});

describe('finding a command', () => {
  it('says so when one of the directories has it', () => {
    expect(onPath(['/usr/bin', '/opt/bin'], ['zed'], (f) => f === '/opt/bin/zed')).toBe(true);
  });

  it('says so when none of them does', () => {
    expect(onPath(['/usr/bin'], ['zed'], (f) => f === '/opt/bin/zed')).toBe(false);
  });
});

describe('whether this machine can run a command', () => {
  it('asks the path for a bare name', () => {
    expect(runnable('zed', machine(['/usr/bin/zed']))).toBe(true);
    expect(runnable('zed', machine([]))).toBe(false);
  });

  it('asks the disk for a path', () => {
    expect(runnable(SUBL, machine([SUBL]))).toBe(true);
    expect(runnable(SUBL, machine([]))).toBe(false);
  });
});

describe('what an editor is called and held on to as', () => {
  it('is named after the application, where it installs as one', () => {
    expect(nameOf('/Applications/Zed.app/Contents/MacOS/zed')).toBe('Zed');
  });

  it('is named after the command, where that is how it installs', () => {
    expect(nameOf('vim')).toBe('vim');
    expect(nameOf('Code.exe')).toBe('Code');
  });

  it('is held on to as a command, never as a path on this machine', () => {
    expect(idOf(SUBL)).toBe('subl');
    expect(idOf('Code.exe')).toBe('Code');
    expect(idOf('zed')).toBe('zed');
  });
});

describe('the editors this machine has', () => {
  it('offers one whose command is on the path, by the name its application has', () => {
    const found = installedEditors(machine(['/usr/bin/zed']));

    expect(found).toEqual([{ id: 'zed', name: 'Zed' }]);
  });

  it('offers one whose command is a path the machine has', () => {
    expect(installedEditors(machine([SUBL]))).toEqual([{ id: 'subl', name: 'Sublime Text' }]);
  });

  it('leaves out an application installed without the command that launches it', () => {
    expect(installedEditors(machine(['/Applications/Zed.app/Contents/MacOS/zed']))).toEqual([]);
  });

  it('finds a terminal editor on macOS as readily as on Linux', () => {
    expect(installedEditors(machine(['/usr/bin/vim']))).toEqual([{ id: 'vim', name: 'vim' }]);
    expect(installedEditors(machine(['/usr/bin/vim'], 'linux'))).toEqual([
      { id: 'vim', name: 'vim' },
    ]);
  });

  it('finds an executable on the path on Windows', () => {
    expect(installedEditors(machine(['/usr/bin/Code.exe'], 'win32'))).toEqual([
      { id: 'Code', name: 'Code' },
    ]);
  });

  it('names each editor once, however many ways it is installed', () => {
    const found = installedEditors(machine(['/usr/bin/code']));

    expect(found).toEqual([{ id: 'code', name: 'Visual Studio Code' }]);
  });

  it('finds none on a machine with nothing installed', () => {
    expect(installedEditors(machine([]))).toEqual([]);
  });
});

describe('what the panel is allowed to launch', () => {
  it('is an editor this machine reported', () => {
    expect(launcherOf('subl', machine([SUBL]))).toBe(SUBL);
  });

  it('is never something it was not offered', () => {
    expect(launcherOf('rm -rf /', machine(['/usr/bin/vim']))).toBeNull();
    expect(launcherOf('vim', machine([]))).toBeNull();
  });
});

describe('where a file the panel names actually is', () => {
  const root = '/repo/clients/web';
  const has =
    (...files: string[]) =>
    (path: string) =>
      files.includes(path);

  it('takes a path outside the root as it stands', () => {
    const at = resolveFile(
      '/repo/packages/ui/text.tsx:80:3',
      root,
      has('/repo/packages/ui/text.tsx'),
    );

    expect(at).toBe('/repo/packages/ui/text.tsx:80:3');
  });

  it('reads one inside the root as the url it is, not the path it looks like', () => {
    const at = resolveFile('/src/who.tsx:148:8', root, has('/repo/clients/web/src/who.tsx'));

    expect(at).toBe('/repo/clients/web/src/who.tsx:148:8');
  });

  it('keeps a file that names no column', () => {
    const at = resolveFile('/src/who.tsx:12', root, has('/repo/clients/web/src/who.tsx'));

    expect(at).toBe('/repo/clients/web/src/who.tsx:12');
  });

  it('says nothing for a file that is neither', () => {
    expect(resolveFile('/nope.tsx:1:1', root, () => false)).toBeNull();
  });
});

describe('which files may be opened', () => {
  const trees = ['/repo'];

  it('is anything in a tree the server already serves', () => {
    expect(within('/repo/clients/web/src/who.tsx', trees)).toBe(true);
  });

  it('is nothing outside them', () => {
    expect(within('/etc/passwd', trees)).toBe(false);
    expect(within('/repo/../secrets/keys.txt', trees)).toBe(false);
  });

  it('is not the tree itself', () => {
    expect(within('/repo', trees)).toBe(false);
  });
});

describe('asking the machine this is actually running on', () => {
  it('answers without being told what the machine looks like', () => {
    const found = installedEditors();

    expect(Array.isArray(found)).toBe(true);
    for (const editor of found) expect(launcherOf(editor.id)).toBeTruthy();
  });

  it('offers them in the order a person reads', () => {
    const at = machine(['/usr/bin/zed', '/usr/bin/vim', '/usr/bin/code']);

    expect(installedEditors(at).map((editor) => editor.name)).toEqual([
      'vim',
      'Visual Studio Code',
      'Zed',
    ]);
  });

  it('keeps a file that names no position at all', () => {
    const at = resolveFile(
      '/repo/who.tsx',
      '/repo/clients/web',
      (path) => path === '/repo/who.tsx',
    );

    expect(at).toBe('/repo/who.tsx');
  });

  it('finds nothing on a machine with no PATH at all', () => {
    const where = { path: undefined, platform: 'darwin', exists: () => true };

    expect(runnable('zed', where)).toBe(false);
  });
});
