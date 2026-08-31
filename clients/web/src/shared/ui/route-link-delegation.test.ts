import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const PRESS = /\bon(?:Press|LongPress|Select|Click)\s*=\s*\{/g;

const DESTINATION = /\bto:\s*'([^']+)'/;

const HOOK = /\bfunction (use[A-Z]\w*)\b/g;

interface Source {
  path: string;
  text: string;
}

function sources(dir: string, out: Source[] = []): Source[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) sources(at, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|fixture)\./.test(entry.name)) {
      out.push({ path: relative(ROOT, at), text: readFileSync(at, 'utf8') });
    }
  }
  return out;
}

function braced(source: string, open: number): string {
  let depth = 0;
  for (let at = open; at < source.length; at++) {
    if (source[at] === '{') depth++;
    else if (source[at] === '}' && --depth === 0) return source.slice(open + 1, at);
  }
  return source.slice(open);
}

function statementAt(source: string, from: number): string {
  let depth = 0;
  for (let at = from; at < source.length; at++) {
    const char = source[at] ?? '';
    if ('({['.includes(char)) depth++;
    else if (')}]'.includes(char)) depth--;
    else if (char === ';' && depth === 0) return source.slice(from, at);
  }
  return source.slice(from);
}

function handlerOf(source: string, written: string): string {
  const name = /^[A-Za-z_$][\w$]*$/.exec(written.trim())?.[0];
  if (!name) return written;
  const declared = new RegExp(`\\bconst ${name}\\s*=`).exec(source);
  return declared ? statementAt(source, declared.index) : '';
}

function calls(handler: string, name: string): boolean {
  return new RegExp(`\\b${name}\\s*\\(`).test(handler);
}

function navigatorHooks(files: readonly Source[]): string[] {
  const named = new Set(['useNavigate']);
  for (const { text } of files) {
    for (const hook of text.matchAll(HOOK)) {
      const body = braced(text, text.indexOf('{', hook.index + hook[0].length));
      if (calls(body, 'useNavigate')) named.add(hook[1] as string);
    }
  }
  return [...named];
}

function navigatorsOf(text: string, hooks: readonly string[]): Map<string, string> {
  const bound = new Map<string, string>();
  for (const hook of hooks) {
    for (const held of text.matchAll(new RegExp(`\\bconst ([\\w$]+)\\s*=\\s*${hook}\\(`, 'g'))) {
      bound.set(held[1] as string, hook);
    }
  }
  return bound;
}

function handlersThatNavigate(files: readonly Source[]): string[] {
  const hooks = navigatorHooks(files);
  const found: string[] = [];
  for (const { path, text } of files) {
    const navigators = [...navigatorsOf(text, hooks)];
    for (const press of text.matchAll(PRESS)) {
      const handler = handlerOf(text, braced(text, press.index + press[0].length - 1));
      const through = navigators.find(([held]) => calls(handler, held));
      if (!through) continue;
      found.push(`${path} -> ${DESTINATION.exec(handler)?.[1] ?? through[1]}`);
    }
  }
  return found.sort();
}

const OUR_HOOK: Source = {
  path: 'features/admin/history-link.ts',
  text: [
    'export function useHistoryLink() {',
    '  const navigate = useNavigate();',
    "  return (filters) => void navigate({ to: '/admin/history', search: filters });",
    '}',
  ].join('\n'),
};

describe('a control that goes somewhere', () => {
  it('is a link rather than a press handler that navigates', () => {
    const offenders = handlersThatNavigate(sources(ROOT));

    expect(offenders).toEqual([]);
  });

  it('is caught when its handler calls the router itself', () => {
    const caller: Source = {
      path: 'features/admin/panel.tsx',
      text: [
        'const navigate = useNavigate();',
        "<Button onPress={() => navigate({ to: '/admin/history' })} />",
      ].join('\n'),
    };

    expect(handlersThatNavigate([caller])).toEqual(['features/admin/panel.tsx -> /admin/history']);
  });

  it('is caught when its handler calls a navigator a hook handed it', () => {
    const caller: Source = {
      path: 'features/admin/panel.tsx',
      text: [
        'const openHistory = useHistoryLink();',
        '<Button onPress={() => openHistory({ item })} />',
      ].join('\n'),
    };

    expect(handlersThatNavigate([OUR_HOOK, caller])).toEqual([
      'features/admin/panel.tsx -> useHistoryLink',
    ]);
  });
});
