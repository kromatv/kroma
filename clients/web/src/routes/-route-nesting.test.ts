import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROUTES = dirname(fileURLToPath(import.meta.url));

interface RouteFile {
  file: string;
  segments: string[];
  source: string;
}

function routeFiles(): RouteFile[] {
  return readdirSync(ROUTES)
    .filter((file) => file.endsWith('.tsx') && !file.includes('.test.'))
    .map((file) => ({
      file,
      segments: file.replace(/\.tsx$/, '').split('.'),
      source: readFileSync(join(ROUTES, file), 'utf8'),
    }));
}

const isParentOf = (parent: RouteFile, child: RouteFile): boolean =>
  child.segments.length > parent.segments.length &&
  parent.segments.every((segment, at) => child.segments[at] === segment);

describe('the flat route files', () => {
  it('give every nested route a parent that renders an outlet', () => {
    const files = routeFiles();

    const swallowed = files.flatMap((parent) =>
      files
        .filter((child) => isParentOf(parent, child) && !parent.source.includes('<Outlet'))
        .map((child) => `${child.file} is nested under ${parent.file}, which renders no <Outlet>`),
    );

    expect(swallowed).toEqual([]);
  });
});
