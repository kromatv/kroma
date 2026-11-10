import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { PUBLISHED_PACKAGE } from '../src/cli/published.ts';

const PACKAGE = PUBLISHED_PACKAGE;
const COMMAND = 'kroma-tv';
const SHIPPED = ['LICENSE', 'README.md', 'cli.js', 'package.json'];

const staged = join(import.meta.dir, '..', 'dist', 'npm');
const tarball = (await readdir(staged)).find((name) => name.endsWith('.tgz'));
if (!tarball) throw new Error(`no tarball in ${staged}: run the stage script first`);

const app = await mkdtemp(join(tmpdir(), 'kroma-installer-smoke-'));
try {
  await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'smoke', private: true }));
  await $`npm install --no-audit --no-fund ${join(staged, tarball)}`.cwd(app);

  const installed = join(app, 'node_modules', PACKAGE);
  const shipped = await readdir(installed);
  const differs =
    shipped.some((name) => !SHIPPED.includes(name)) ||
    SHIPPED.some((name) => !shipped.includes(name));
  if (differs) {
    throw new Error(`the package ships ${shipped.join(', ')}, not ${SHIPPED.join(', ')}`);
  }
  if ((await readFile(join(installed, 'cli.js'), 'utf8')).includes('Bun.')) {
    throw new Error('the bundle still calls Bun, which Node does not have');
  }

  const bin = join(app, 'node_modules', '.bin', COMMAND);
  const say = (...args: string[]) =>
    $`${bin} ${args}`
      .cwd(app)
      .env({ ...process.env, NO_COLOR: '1' })
      .text();

  const help = await say('--help');
  if (!help.includes(COMMAND) || !help.includes('install') || !help.includes('update')) {
    throw new Error(`--help did not describe the commands:\n${help}`);
  }

  const found: unknown = JSON.parse(await say('scan', '--host', '127.0.0.1', '--json'));
  if (!Array.isArray(found)) throw new Error('scan --json did not print a list');

  const version = (await say('--version')).trim();
  if (!tarball.includes(version)) throw new Error(`--version says ${version}, not ${tarball}`);

  const node = (await $`node --version`.text()).trim();
  console.log(`${PACKAGE}@${version} runs from its tarball under Node ${node}`);
} finally {
  await rm(app, { recursive: true, force: true });
}
