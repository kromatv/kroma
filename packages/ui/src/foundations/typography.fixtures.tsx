import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

import type { TypeSpec } from '#ui/core/tokens';

export const SPECIMEN = 'Blade Runner 2049';

export function tracking(em: number | undefined) {
  if (em === undefined) return '';
  const sign = em > 0 ? '+' : '';
  return ` · ${sign}${em}em`;
}

export function metrics(spec: TypeSpec) {
  const leading = `${Math.round(spec.size * spec.ratio)} (${spec.ratio})`;
  return `${spec.size} / ${spec.weight} · ${leading}${tracking(spec.em)}`;
}

export function Row({
  name,
  detail,
  children,
}: Readonly<{ name: string; detail: string; children: React.ReactNode }>) {
  return (
    <Box row align="baseline" gap={24}>
      <Box w={132} shrink={0}>
        <Text variant="meta" color="textDim">
          {name}
        </Text>
        <Text variant="overline" color="textMuted">
          {detail}
        </Text>
      </Box>
      {children}
    </Box>
  );
}

export function Section({
  title,
  hint,
  children,
}: Readonly<{ title: string; hint: string; children: React.ReactNode }>) {
  return (
    <Box gap={18}>
      <Box gap={4}>
        <Text variant="overline" color="accentText">
          {title}
        </Text>
        <Text variant="meta" color="textDim" maxW={620}>
          {hint}
        </Text>
      </Box>
      {children}
    </Box>
  );
}
