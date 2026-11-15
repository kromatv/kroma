import { Box, Rail, styles, typeSpec as textRoles, useStyles } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';

const sDefinition = styles({
  title: {
    fontSize: textRoles.subheadingTv.size,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.56,
  },
  reason: { color: 'textDim', mt: -10 },
});

interface HomeRowProps {
  title: string;
  reason?: string | null;
  children: ReactNode;
}

/** One titled row of the home, with the quiet line saying why it is offered.
 * Its child is the row's `<Rail.List>`. */
export function HomeRow({ title, reason, children }: Readonly<HomeRowProps>) {
  const s = useStyles(sDefinition);

  return (
    <Box mb={8} mt={18}>
      <Rail.Root>
        <Rail.Title style={s.title}>{title}</Rail.Title>
        {reason ? (
          <Rail.Title variant="captionTv" style={s.reason}>
            {reason}
          </Rail.Title>
        ) : null}
        {children}
      </Rail.Root>
    </Box>
  );
}
