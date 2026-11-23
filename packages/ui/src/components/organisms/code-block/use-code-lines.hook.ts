import { useEffect, useMemo, useState } from 'react';
import type { Token } from './code-tokens';

interface Painted {
  code: string;
  rows: Token[][];
}

function plainLines(code: string): Token[][] {
  return code.split('\n').map((line) => (line ? [{ text: line, kind: 'plain' }] : []));
}

/** The lines of `code`, plain on the first frame and coloured once the parser
 * has loaded, so the parser stays out of every bundle that never shows code. */
function useCodeLines(code: string): Token[][] {
  const plain = useMemo(() => plainLines(code), [code]);
  const [painted, setPainted] = useState<Painted | null>(null);

  useEffect(() => {
    let live = true;
    void import('./code-tokens').then(({ lines }) => {
      if (live) {
        setPainted({ code, rows: lines(code) });
      }
    });
    return () => {
      live = false;
    };
  }, [code]);

  return painted?.code === code ? painted.rows : plain;
}

export { useCodeLines };
