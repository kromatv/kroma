import type { DropzoneRejection, DropzoneRootProps } from './dropzone-parts';

function accepts(file: File, accept: string | undefined): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  return accept
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith('.')) return name.endsWith(rule);
      if (rule.endsWith('/*')) return file.type.startsWith(rule.slice(0, -1));
      return file.type === rule;
    });
}

/** Split what arrived into what the zone takes and what it turns away. */
export function sift(
  files: readonly File[],
  { accept, maxSize, multiple }: Pick<DropzoneRootProps, 'accept' | 'maxSize' | 'multiple'>,
): { taken: File[]; turned: DropzoneRejection[] } {
  const taken: File[] = [];
  const turned: DropzoneRejection[] = [];
  for (const file of files) {
    if (!accepts(file, accept)) {
      turned.push({ file, reason: 'type' });
      continue;
    }
    if (maxSize !== undefined && file.size > maxSize) {
      turned.push({ file, reason: 'size' });
      continue;
    }
    taken.push(file);
  }
  // A single-file zone takes the first and says nothing about the rest: they
  // were not rejected by a rule, they were simply not asked for.
  return { taken: multiple ? taken : taken.slice(0, 1), turned };
}
