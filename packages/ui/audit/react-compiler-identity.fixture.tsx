import type { ComponentType } from 'react';
// This fixture is transformed by the same Vite pass as shipped components.
export function CompiledParent({
  value,
  Child,
}: {
  value: number;
  Child: ComponentType<{ payload: { value: number } }>;
}) {
  return <Child payload={{ value }} />;
}
