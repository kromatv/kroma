import { describe, expect, it } from 'vitest';
import { APPS, appInputs, closure, reaching, readWorkspaces, type Workspace } from './app-inputs';

const workspaces = new Map<string, Workspace>([
  ['@kromatv/mobile', { dir: 'clients/mobile', deps: ['@kromatv/ui', '@kromatv/client'] }],
  ['@kromatv/ui', { dir: 'packages/ui', deps: ['@kromatv/core'] }],
  ['@kromatv/core', { dir: 'packages/core', deps: ['@kromatv/client', '@kromatv/ui'] }],
  ['@kromatv/client', { dir: 'packages/client', deps: [] }],
  ['@kromatv/web', { dir: 'clients/web', deps: ['@kromatv/ui'] }],
]);

describe('closure', () => {
  it('follows every workspace dependency once, through cycles, and nothing else', () => {
    expect(closure('@kromatv/mobile', workspaces)).toEqual([
      'clients/mobile',
      'packages/client',
      'packages/core',
      'packages/ui',
    ]);
  });

  it('is empty for a name no workspace carries', () => {
    expect(closure('@kromatv/nothing', workspaces)).toEqual([]);
  });
});

describe('reaching', () => {
  const inputs = appInputs(APPS.mobile, workspaces);

  it('keeps the changes that reach the app, its build scripts and its workflow', () => {
    const files = [
      'packages/ui/src/components/atoms/button/button.tsx',
      'bun.lock',
      '.github/scripts/ios-archive-export-ipa.sh',
      '.github/workflows/_release-mobile.yml',
      'server/src/main.rs',
      'clients/web/src/app.tsx',
      '.github/workflows/_release-appletv.yml',
    ];

    expect(reaching(files, inputs)).toEqual(files.slice(0, 4));
  });

  it('leaves out tests and prose inside the app', () => {
    const files = ['packages/core/src/auth/auth.test.ts', 'clients/mobile/README.md', 'docs/ci.md'];

    expect(reaching(files, inputs)).toEqual([]);
  });

  it('counts a change it cannot list as reaching everything', () => {
    expect(reaching('all', inputs)).toBe('all');
  });
});

describe('appInputs', () => {
  it('reaches the kit and the TV experience from the real Apple TV app, never the server', () => {
    const inputs = appInputs(APPS.appletv, readWorkspaces());

    expect(inputs).toContain('clients/tv-native/**');
    expect(inputs).toContain('packages/tv/**');
    expect(inputs).toContain('packages/ui/**');
    expect(reaching(['server/Cargo.lock', 'clients/mobile/app.json'], inputs)).toEqual([]);
  });
});
