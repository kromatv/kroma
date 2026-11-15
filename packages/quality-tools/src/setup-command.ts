import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { $ } from 'bun';
import { MAX_PIN_BYTES, readBounded } from './files';
import { type Layout, layout, toolDir } from './layout';
import { type Pin, parsePins } from './pins';
import { PYTHON_CANDIDATES, pickPython, type PythonProbe } from './python';
import { root } from './root';
import { installStamp, stampPath } from './tool';

const PRINT_VERSION = 'import sys; print("%d.%d.%d" % sys.version_info[:3])';

async function probe(command: string): Promise<PythonProbe> {
  const asked = await $`${command} -c ${PRINT_VERSION}`.quiet().nothrow();
  return { command, version: asked.exitCode === 0 ? asked.stdout.toString().trim() : undefined };
}

async function checkedOut(dir: string): Promise<string> {
  return (await $`git -C ${dir} rev-parse HEAD`.quiet().text()).trim();
}

async function install(at: Layout, pin: Pin): Promise<void> {
  const dir = toolDir(at, pin.name);
  if (!existsSync(join(dir, '.git'))) {
    await $`git clone --quiet ${pin.url} ${dir}`;
  }
  if ((await checkedOut(dir)) !== pin.commit) {
    await $`git -C ${dir} fetch --quiet origin`;
    await $`git -C ${dir} checkout --quiet --detach ${pin.commit}`;
  }
  console.log(`${pin.name} at ${pin.commit.slice(0, 12)}`);
}

async function environment(at: Layout): Promise<void> {
  if (!existsSync(at.python)) {
    const python = pickPython(await Promise.all(PYTHON_CANDIDATES.map(probe)));
    await $`${python} -m venv ${join(at.tools, 'venv')}`;
  }
  await $`${at.python} -m pip install --quiet --disable-pip-version-check -r ${at.requirements}`;
  console.log((await $`${at.python} --version`.quiet().text()).trim());
}

export async function main(): Promise<void> {
  const at = layout(root);
  const pins = parsePins(readBounded(at.pins, MAX_PIN_BYTES));
  mkdirSync(at.tools, { recursive: true });
  await Promise.all(pins.map((pin) => install(at, pin)));
  await environment(at);
  writeFileSync(stampPath(at), installStamp(at));
  console.log(`quality tools ready in ${relative(root, at.tools)}`);
}
