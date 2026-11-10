import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { unzipSync, type Zippable, zipSync } from 'fflate';

/** Unpacks a zip into `directory`, refusing an entry that would land outside it. */
export async function extractZip(archive: string, directory: string): Promise<void> {
  const base = resolve(directory);
  const entries = unzipSync(await readFile(archive));
  for (const [name, bytes] of Object.entries(entries)) {
    const target = resolve(base, name);
    if (!target.startsWith(`${base}${sep}`)) {
      throw new Error(`${archive} holds ${name}, which would land outside ${directory}`);
    }
    if (name.endsWith('/')) {
      await mkdir(target, { recursive: true });
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}

/** Packs every file under `directory` into a zip, named by its path from there. */
export async function packZip(directory: string, archive: string): Promise<void> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort((a, b) => a.localeCompare(b));

  const files: Zippable = {};
  for (const path of paths) {
    files[relative(directory, path).split(sep).join('/')] = await readFile(path);
  }
  await writeFile(archive, zipSync(files));
}
