import { Prisma } from "@prisma/client";
import { MatchDto } from "./types";

export interface MatchAlly {
  name: string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
}

/** Campos ricos de uma partida pro tracked player — prontos pra gravar na tabela Match. */
export interface MatchDetailFields {
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  champion: string;
  playedAt: Date;
  remake: boolean;
  queueId: number;
  position: string | null;
  teamId: number;
  cs: number;
  durationSeconds: number;
  killParticipation: number | null;
  goldEarned: number;
  visionScore: number;
  allies: MatchAlly[];
}

/**
 * Extrai o detalhe da partida pro player identificado por `puuid`.
 * Retorna null se o player não participou dessa partida.
 * Usado pelo polling (`pollMatches`) e pelo backfill.
 */
export function extractMatchDetail(match: MatchDto, puuid: string): MatchDetailFields | null {
  const me = match.info.participants.find((p) => p.puuid === puuid);
  if (!me) return null;

  const allies: MatchAlly[] = match.info.participants
    .filter((p) => p.teamId === me.teamId && p.puuid !== puuid)
    .map((p) => ({
      name: p.riotIdGameName || "?",
      champion: p.championName,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      win: p.win,
    }));

  return {
    win: me.win,
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    champion: me.championName,
    playedAt: new Date(match.info.gameEndTimestamp ?? match.info.gameCreation),
    remake: me.gameEndedInEarlySurrender,
    queueId: match.info.queueId,
    position: me.teamPosition || null,
    teamId: me.teamId,
    cs: me.totalMinionsKilled + me.neutralMinionsKilled,
    durationSeconds: match.info.gameDuration,
    killParticipation: me.challenges?.killParticipation ?? null,
    goldEarned: me.goldEarned,
    visionScore: me.visionScore,
    allies,
  };
}

/** Colunas de detalhe prontas pra `Match` create/update (com `allies` no formato JSON do Prisma). */
export function detailColumns(detail: MatchDetailFields) {
  return {
    queueId: detail.queueId,
    position: detail.position,
    teamId: detail.teamId,
    cs: detail.cs,
    durationSeconds: detail.durationSeconds,
    killParticipation: detail.killParticipation,
    goldEarned: detail.goldEarned,
    visionScore: detail.visionScore,
    allies: detail.allies as unknown as Prisma.InputJsonValue,
    detailFetchedAt: new Date(),
  };
}
