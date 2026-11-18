import type { Importer } from '@kromatv/client/importers';
import { moduleIconUrl } from '@kromatv/module-sdk';
import { Box } from '@kromatv/ui/kit';
import { apiBase } from '#web/shared/lib/api';
import { Image } from '#web/shared/ui';

/** The picture of the server an importer reads. An installed importer serves
 * its own, and one the registry offers carries it. */
export function ImporterIcon({ importer }: Readonly<{ importer: Importer }>) {
  const src = importer.installed ? moduleIconUrl(importer.id, apiBase()) : importer.icon;
  return (
    <Box w={48} h={48} radius="lg" overflow="hidden" bg="tint/6">
      {src ? <Image src={src} fit="cover" fill /> : null}
    </Box>
  );
}
