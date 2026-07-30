import { Logo } from '@kroma/ui/kit';

export function KromaLockup({ height = 40 }: Readonly<{ height?: number }>) {
  return <Logo size={height} />;
}
