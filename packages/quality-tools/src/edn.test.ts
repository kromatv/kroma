import { describe, expect, it } from 'vitest';
import { readEdn } from './edn';

describe('readEdn', () => {
  it('reads a map of keywords as an object, with commas as blank space', () => {
    const edn = '{:name "place", :namespace "demo.Board", :complexity 3, :coverage 75.0}';

    expect(readEdn(edn)).toEqual({
      name: 'place',
      namespace: 'demo.Board',
      complexity: 3,
      coverage: 75,
    });
  });

  it('reads vectors, lists, nested maps and a string key', () => {
    const edn = '{:entries [{:crap nil} (1 2)]\n "k" {:left {:start-line 3}}}';

    expect(readEdn(edn)).toEqual({
      entries: [{ crap: null }, [1, 2]],
      k: { left: { 'start-line': 3 } },
    });
  });

  it('reads nil, booleans, numbers, keywords and bare symbols', () => {
    expect(readEdn('[nil true false -2 1.5 :survived defn]')).toEqual([
      null,
      true,
      false,
      -2,
      1.5,
      'survived',
      'defn',
    ]);
  });

  it('unescapes a string', () => {
    expect(readEdn(String.raw`"a \"quoted\" \\ back\nline\ttab\rend"`)).toBe(
      'a "quoted" \\ back\nline\ttab\rend',
    );
  });

  it('reads an empty map and an empty vector', () => {
    expect(readEdn('{:entries []}')).toEqual({ entries: [] });
    expect(readEdn(' {} ')).toEqual({});
  });

  it('rejects input that ends before its form does', () => {
    expect(() => readEdn('')).toThrow(/ends early/);
    expect(() => readEdn('{:entries [')).toThrow(/ends early/);
    expect(() => readEdn('"open')).toThrow(/never closes/);
  });

  it('rejects a closer with no opener and anything after the form', () => {
    expect(() => readEdn(']')).toThrow(/unexpected '\]'/);
    expect(() => readEdn('[1 }')).toThrow(/unexpected '\}'/);
    expect(() => readEdn('{} {}')).toThrow(/after the EDN form/);
  });

  it('rejects a map with a dangling key or a key that is not a name', () => {
    expect(() => readEdn('{:a}')).toThrow(/key without a value/);
    expect(() => readEdn('{1 2}')).toThrow(/neither a keyword nor a string/);
  });

  it('refuses to nest without end', () => {
    expect(() => readEdn('['.repeat(40))).toThrow(/nests too deep/);
  });
});
