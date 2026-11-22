import { useT } from '@kromatv/ui';
import {
  Avatar,
  Box,
  radius as cornerRadius,
  Focusable,
  KidsMark,
  StatusDot,
  style,
  Text,
} from '@kromatv/ui/kit';

const TILE = style({ radius: cornerRadius.dialog });

export interface TvProfileTileProps {
  name: string;
  seed: string;
  src: string | null | undefined;
  locked: boolean;
  kids: boolean;
  online: boolean | undefined;
  serverName: string;
  autoFocus: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

/** One profile on the picker: its avatar, with the Kids mark on a Kids profile
 *  and a lock on a PIN profile, its name, and whether its server answers. */
export function TvProfileTile(tile: Readonly<TvProfileTileProps>) {
  return (
    <Box w={150} align="center" gap={12}>
      <Focusable
        onPress={tile.onPress}
        onLongPress={tile.onLongPress}
        label={tile.name}
        autoFocus={tile.autoFocus}
        focusScale={1.07}
        style={TILE}
      >
        <TileFace {...tile} />
      </Focusable>
      <TileCaption {...tile} />
    </Box>
  );
}

function TileFace(tile: Readonly<TvProfileTileProps>) {
  return (
    <Box opacity={tile.online === false ? 0.4 : 1}>
      <Avatar name={tile.name} seed={tile.seed} size={146} src={tile.src} locked={tile.locked} />
      {tile.kids ? (
        <Box absolute left={10} bottom={10}>
          <KidsMark size="md" />
        </Box>
      ) : null}
    </Box>
  );
}

function TileCaption(tile: Readonly<TvProfileTileProps>) {
  const t = useT();
  const offline = tile.online === false;
  return (
    <Box align="center" gap={5}>
      <Text variant="leadTv" color="text/82">
        {tile.name}
      </Text>
      <Box row align="center" gap={6}>
        <StatusDot online={tile.online} />
        <Text variant="meta" color={offline ? 'danger' : 'text/42'}>
          {offline ? t('connection.offline') : tile.serverName}
        </Text>
      </Box>
    </Box>
  );
}
