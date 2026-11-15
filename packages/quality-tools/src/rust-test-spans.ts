export interface LineSpan {
  start: number;
  end: number;
}

const TEST_ONLY = /^\s*#\[cfg\((?:test\)|a(?:ny|ll)\(test[,)])/;

interface Line {
  index: number;
  text: string;
}

const isItem = (text: string) => {
  const trimmed = text.trim();
  return trimmed.length > 0 && !trimmed.startsWith('#[') && !trimmed.startsWith('//');
};

function itemAfter(lines: readonly string[], attribute: number): Line | undefined {
  for (const [index, text] of lines.entries()) {
    if (index > attribute && isItem(text)) {
      return { index, text };
    }
  }
  return undefined;
}

function closeOf(lines: readonly string[], item: Line): number | undefined {
  if (item.text.trimEnd().endsWith(';')) {
    return undefined;
  }
  const close = `${item.text.slice(0, item.text.length - item.text.trimStart().length)}}`;
  for (const [index, text] of lines.entries()) {
    if (index > item.index && text.startsWith(close)) {
      return text.trimEnd() === close ? index : undefined;
    }
  }
  return undefined;
}

/**
 * The 1-based line ranges a Rust file compiles for tests alone: each
 * `#[cfg(test)]` item that opens a block, attribute to closing brace. It
 * trusts rustfmt's layout, where a block closes on the first later line that
 * is a lone `}` at the opener's indentation.
 */
export function rustTestSpans(source: string): LineSpan[] {
  const lines = source.split('\n');
  const spans: LineSpan[] = [];
  lines.forEach((line, attribute) => {
    if (!TEST_ONLY.test(line)) {
      return;
    }
    const item = itemAfter(lines, attribute);
    const close = item === undefined ? undefined : closeOf(lines, item);
    if (close !== undefined) {
      spans.push({ start: attribute + 1, end: close + 1 });
    }
  });
  return spans;
}
