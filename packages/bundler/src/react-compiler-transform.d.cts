import type { TransformResult } from 'oxc-transform-react';
export declare function compileReactSource(
  source: string,
  id: string,
  sourcemap?: boolean,
  reportDiagnostics?: boolean,
): TransformResult | null;
