import { describe, expect, it } from 'vitest';
import { judgeFileSize, rustCodeLines } from './file-size';

describe('rustCodeLines', () => {
  it('counts code, and no blank line, comment or test module', () => {
    const source = [
      '// a comment',
      'pub fn one() -> u8 {',
      '',
      '    1',
      '}',
      '',
      '#[cfg(test)]',
      'mod tests {',
      '    #[test]',
      '    fn it_is_one() {}',
      '}',
    ].join('\n');

    expect(rustCodeLines(source)).toBe(3);
  });
});

describe('judgeFileSize', () => {
  it('finds nothing in a file at the limit', () => {
    expect(judgeFileSize('a.rs', 300, 0)).toBeUndefined();
  });

  it('fails a new file over the limit', () => {
    expect(judgeFileSize('a.rs', 301, 0)).toEqual({
      file: 'a.rs',
      lines: 301,
      limit: 300,
      inherited: false,
    });
  });

  it('fails a file the change makes longer, and not one it shortens or leaves as long', () => {
    expect(judgeFileSize('a.rs', 520, 500)?.inherited).toBe(false);
    expect(judgeFileSize('a.rs', 500, 500)?.inherited).toBe(true);
    expect(judgeFileSize('a.rs', 480, 500)?.inherited).toBe(true);
  });
});
