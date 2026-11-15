import { describe, expect, it } from 'vitest';
import { rustTestSpans } from './rust-test-spans';

const source = (...lines: string[]) => lines.join('\n');

describe('rustTestSpans', () => {
  it('spans a test module from its attribute to its closing brace', () => {
    const file = source(
      'pub fn add(a: i32, b: i32) -> i32 {',
      '    a + b',
      '}',
      '',
      '#[cfg(test)]',
      'mod tests {',
      '    use super::*;',
      '',
      '    #[test]',
      '    fn adds() {',
      '        assert_eq!(add(1, 2), 3);',
      '    }',
      '}',
    );

    expect(rustTestSpans(file)).toEqual([{ start: 5, end: 13 }]);
  });

  it('spans a test-only function and impl, through further attributes and comments', () => {
    const file = source(
      '#[cfg(test)]',
      '#[allow(dead_code)]',
      '// a stub the tests share',
      'fn stub(',
      '    name: &str,',
      ') -> Stub {',
      '    Stub::new(name)',
      '}',
      '',
      'impl Stub {',
      '    #[cfg(any(test, feature = "testing"))]',
      '    pub fn reset(&mut self) {',
      '        self.calls.clear();',
      '    }',
      '}',
    );

    expect(rustTestSpans(file)).toEqual([
      { start: 1, end: 8 },
      { start: 11, end: 14 },
    ]);
  });

  it('has no span for an item without a block', () => {
    const file = source(
      '#[cfg(test)]',
      'mod tests;',
      '',
      '#[cfg(test)]',
      'use crate::testing::{',
      '    Stub,',
      '};',
      '',
      'fn real() {',
      '}',
    );

    expect(rustTestSpans(file)).toEqual([]);
  });

  it('ignores an attribute that is not about tests, and one with nothing after it', () => {
    expect(rustTestSpans(source('#[cfg(feature = "local")]', 'fn f() {', '}'))).toEqual([]);
    expect(rustTestSpans(source('fn f() {', '}', '#[cfg(test)]', ''))).toEqual([]);
    expect(rustTestSpans(source('#[cfg(test)]', 'mod tests {', '    fn f() {}'))).toEqual([]);
  });

  it('reads an all(test, ...) condition as test only', () => {
    const file = source('#[cfg(all(test, unix))]', 'mod unix_tests {', '}');

    expect(rustTestSpans(file)).toEqual([{ start: 1, end: 3 }]);
  });
});
