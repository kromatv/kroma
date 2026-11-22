import { Logo } from '@kromatv/ui/kit';

export function KromaLockup({
  height = 40,
  kids = false,
}: Readonly<{ height?: number; kids?: boolean }>) {
  return <Logo size={height} kids={kids} />;
}
