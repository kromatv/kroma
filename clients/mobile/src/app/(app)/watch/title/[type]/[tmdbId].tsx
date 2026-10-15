import { TmdbKind } from '@kromatv/client/discovery';
import { sizedImageUrl, type WatchSubject, watchableTitle } from '@kromatv/core';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { routeParam } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { WatchStage } from '#mobile/player/WatchStage';

const POSTER_W = 780;

interface At {
  season: number;
  episode: number;
}

function episodeAt(season?: string, episode?: string): At | null {
  if (!(season && episode)) return null;
  const at = { season: Number(season), episode: Number(episode) };
  return Number.isFinite(at.season) && Number.isFinite(at.episode) ? at : null;
}

export default function WatchTitleRoute() {
  const params = useLocalSearchParams<{
    type?: string;
    tmdbId?: string;
    season?: string;
    episode?: string;
  }>();
  const kind = TmdbKind.safeParse(routeParam(params.type));
  const tmdbId = Number(routeParam(params.tmdbId));
  const at = episodeAt(params.season, params.episode);
  if (!(kind.success && Number.isFinite(tmdbId))) return <Redirect href="/" />;
  return <WatchTitle kind={kind.data} tmdbId={tmdbId} at={at} />;
}

function WatchTitle({
  kind,
  tmdbId,
  at,
}: Readonly<{ kind: TmdbKind; tmdbId: number; at: At | null }>) {
  const client = useClient();
  const fiche = useQuery(client.query.discovery.detail(kind, tmdbId));

  const detail = fiche.data;
  const film = detail ? watchableTitle(detail, at) : null;
  if (detail && !film) return <Redirect href={`/discover/${kind}/${tmdbId}` as never} />;

  const subject: WatchSubject | null = film ? { kind: 'title', title: film } : null;
  return (
    <WatchStage
      subject={subject}
      poster={sizedImageUrl(client.media.artwork.resolve(detail?.posterUrl), POSTER_W)}
    />
  );
}
