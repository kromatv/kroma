import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { createPerfSampler, type PerfSampler } from './perf';

const Context = createContext<PerfSampler | null>(null);

/** A measurement lifetime belongs to this root, including its rAF cleanup. */
export function PerfProvider({
  children,
  debug = false,
}: Readonly<{ children: ReactNode; debug?: boolean }>) {
  const [sampler] = useState(createPerfSampler);
  useEffect(() => {
    const api = {
      start: sampler.startPerf,
      stop: sampler.stopPerf,
      reset: sampler.resetPerf,
      report: sampler.perfReport,
    };
    const previous: unknown = Reflect.get(globalThis, 'KROMA_PERF');
    if (debug) Reflect.set(globalThis, 'KROMA_PERF', api);
    return () => {
      sampler.stopPerf();
      if (debug && Reflect.get(globalThis, 'KROMA_PERF') === api) {
        if (previous === undefined) Reflect.deleteProperty(globalThis, 'KROMA_PERF');
        else Reflect.set(globalThis, 'KROMA_PERF', previous);
      }
    };
  }, [sampler, debug]);
  return <Context.Provider value={sampler}>{children}</Context.Provider>;
}

export function usePerfSampler(): PerfSampler | null {
  return useContext(Context);
}
