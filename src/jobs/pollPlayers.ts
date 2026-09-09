import { Player } from "@prisma/client";
import { prisma } from "../db/client";
import {
  getMatchIdsByPuuid,
  getMatchById,
  getLeagueEntriesByPuuid,
  getActiveGameByPuuid,
} from "../riot/endpoints";
import { rankToValue } from "../riot/rank";
import { extractMatchDetail, detailColumns } from "../riot/matchDetail";
import { CHALLENGE_START } from "./leaderboard";

const RANKED_SOLO_QUEUE = "RANKED_SOLO_5x5";
const RANKED_SOLO_QUEUE_ID = 420; // único tipo de partida que a gente rastreia/notifica
const MATCHES_PER_POLL = 10;

export async function pollAllPlayers(): Promise<void> {
  const players = await prisma.player.findMany();
  console.log(`[poll] Checando ${players.length} player(s)...`);

  for (const player of players) {
    try {
      await pollPlayer(player);
    } catch (err) {
      console.error(`[poll] Erro ao processar ${player.riotId}#${player.tagLine}:`, err);
    }
  }
}

async function pollPlayer(player: Player): Promise<void> {
  await pollMatches(player);
  await pollRankDecay(player);
  await pollLiveGame(player);
}

interface RankDelta {
  hasChange: boolean;
  tierBefore: string;
  rankBefore: string;
  lpBefore: number;
  tierAfter: string;
  rankAfter: string;
  lpAfter: number;
  lpChange: number;
  lpBalance: number;
}

/**
 * Busca o rank atual e sincroniza com o último RankSnapshot. Só grava um snapshot novo se
 * realmente mudou algo (ou for o baseline) — evita gerar histórico duplicado a cada polling.
 */
async function syncRank(player: Player): Promise<RankDelta | null> {
  const entries = await getLeagueEntriesByPuuid(player.puuid);
  const solo = entries.find((entry) => entry.queueType === RANKED_SOLO_QUEUE);
  if (!solo) return null;

  const lastSnapshot = await prisma.rankSnapshot.findFirst({
    where: { playerId: player.id },
    orderBy: { capturedAt: "desc" },
  });

  const newValue = rankToValue(solo.tier, solo.rank, solo.leaguePoints);
  const oldValue = lastSnapshot ? rankToValue(lastSnapshot.tier, lastSnapshot.rank, lastSnapshot.lp) : newValue;
  const lpChange = newValue - oldValue;
  const isBaseline = !lastSnapshot;

  await prisma.player.update({
    where: { id: player.id },
    data: { tier: solo.tier, rank: solo.rank, lp: solo.leaguePoints },
  });

  const lpBalance = (lastSnapshot?.lpBalance ?? 0) + lpChange;

  if (isBaseline || lpChange !== 0) {
    await prisma.rankSnapshot.create({
      data: { playerId: player.id, tier: solo.tier, rank: solo.rank, lp: solo.leaguePoints, lpChange, lpBalance },
    });
  }

  return {
    hasChange: !isBaseline && lpChange !== 0,
    tierBefore: lastSnapshot?.tier ?? solo.tier,
    rankBefore: lastSnapshot?.rank ?? solo.rank,
    lpBefore: lastSnapshot?.lp ?? solo.leaguePoints,
    tierAfter: solo.tier,
    rankAfter: solo.rank,
    lpAfter: solo.leaguePoints,
    lpChange,
    lpBalance,
  };
}

async function pollMatches(player: Player): Promise<void> {
  const matchIds = await getMatchIdsByPuuid(player.puuid, {
    count: MATCHES_PER_POLL,
    queue: RANKED_SOLO_QUEUE_ID,
  });

  const existing = await prisma.match.findMany({
    where: { playerId: player.id, matchId: { in: matchIds } },
    select: { matchId: true },
  });
  const existingIds = new Set(existing.map((m) => m.matchId));
  const newMatchIds = matchIds.filter((id) => !existingIds.has(id)).reverse(); // mais antiga primeiro

  for (const matchId of newMatchIds) {
    const matchDetail = await getMatchById(matchId);
    const participant = matchDetail.info.participants.find((p) => p.puuid === player.puuid);
    if (!participant) continue;

    const detail = extractMatchDetail(matchDetail, player.puuid)!;
    const playedAt = detail.playedAt;
    const isRemake = detail.remake;

    const matchDetailData = detailColumns(detail);

    await prisma.match.upsert({
      where: { playerId_matchId: { playerId: player.id, matchId } },
      update: matchDetailData,
      create: {
        matchId,
        playerId: player.id,
        win: detail.win,
        kills: detail.kills,
        deaths: detail.deaths,
        assists: detail.assists,
        champion: detail.champion,
        playedAt,
        remake: isRemake,
        ...matchDetailData,
      },
    });

    // Busca o rank logo após a partida, pra amarrar o ganho/perda de LP a essa partida específica.
    // Remake nunca afeta LP, então nem vale gastar uma chamada à Riot API pra isso.
    const rankDelta = isRemake ? null : await syncRank(player);

    const totalTracked = await prisma.match.count({
      where: { playerId: player.id, playedAt: { gte: CHALLENGE_START }, remake: false },
    });
    const winsTracked = await prisma.match.count({
      where: { playerId: player.id, win: true, playedAt: { gte: CHALLENGE_START }, remake: false },
    });

    const multikill =
      participant.pentaKills > 0
        ? "Pentakill!"
        : participant.quadraKills > 0
          ? "Quadrakill!"
          : participant.tripleKills > 0
            ? "Triplekill!"
            : participant.doubleKills > 0
              ? "Doublekill!"
              : null;

    await prisma.notificationEvent.upsert({
      where: {
        playerId_type_referenceId: { playerId: player.id, type: "MATCH", referenceId: matchId },
      },
      update: {},
      create: {
        playerId: player.id,
        type: "MATCH",
        referenceId: matchId,
        payload: {
          champion: participant.championName,
          win: participant.win,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          playedAt: playedAt.toISOString(),
          position: participant.teamPosition,
          level: participant.champLevel,
          killParticipation: participant.challenges?.killParticipation ?? null,
          cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
          damage: participant.totalDamageDealtToChampions,
          durationSeconds: matchDetail.info.gameDuration,
          items: [
            participant.item0,
            participant.item1,
            participant.item2,
            participant.item3,
            participant.item4,
            participant.item5,
            participant.item6,
          ],
          goldEarned: participant.goldEarned,
          visionScore: participant.visionScore,
          wardsPlaced: participant.wardsPlaced,
          wardsKilled: participant.wardsKilled,
          totalDamageTaken: participant.totalDamageTaken,
          totalHeal: participant.totalHeal,
          multikill,
          remake: isRemake,
          rank: rankDelta?.hasChange
            ? {
                tierBefore: rankDelta.tierBefore,
                rankBefore: rankDelta.rankBefore,
                lpBefore: rankDelta.lpBefore,
                tierAfter: rankDelta.tierAfter,
                rankAfter: rankDelta.rankAfter,
                lpAfter: rankDelta.lpAfter,
                lpChange: rankDelta.lpChange,
                lpBalance: rankDelta.lpBalance,
              }
            : null,
          winsTracked,
          totalTracked,
          participants: matchDetail.info.participants.map((p) => ({
            name: p.riotIdGameName || "?",
            champion: p.championName,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            teamId: p.teamId,
            win: p.win,
            items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6],
            isTracked: p.puuid === player.puuid,
          })),
        },
      },
    });

    console.log(
      `[poll] Nova partida ${matchId} p/ ${player.riotId}: ${participant.championName}, ${participant.win ? "vitória" : "derrota"} (${participant.kills}/${participant.deaths}/${participant.assists})`
    );
  }
}

/** Fallback: detecta mudança de LP sem partida associada (ex: decay por inatividade). */
async function pollRankDecay(player: Player): Promise<void> {
  const lastSnapshotBefore = await prisma.rankSnapshot.findFirst({
    where: { playerId: player.id },
    orderBy: { capturedAt: "desc" },
  });
  if (!lastSnapshotBefore) return; // sem baseline ainda, pollMatches/registro cuida disso

  const delta = await syncRank(player);
  if (!delta || !delta.hasChange) return;

  const totalTracked = await prisma.match.count({
    where: { playerId: player.id, playedAt: { gte: CHALLENGE_START }, remake: false },
  });
  const winsTracked = await prisma.match.count({
    where: { playerId: player.id, win: true, playedAt: { gte: CHALLENGE_START }, remake: false },
  });

  const latestSnapshot = await prisma.rankSnapshot.findFirst({
    where: { playerId: player.id },
    orderBy: { capturedAt: "desc" },
  });

  await prisma.notificationEvent.create({
    data: {
      playerId: player.id,
      type: "RANK_CHANGE",
      referenceId: latestSnapshot!.id,
      payload: {
        tier: delta.tierAfter,
        rank: delta.rankAfter,
        lp: delta.lpAfter,
        lpChange: delta.lpChange,
        lpBalance: delta.lpBalance,
        winsTracked,
        totalTracked,
      },
    },
  });

  console.log(
    `[poll] Mudança de rank sem partida associada p/ ${player.riotId} (provável decay): ${delta.tierAfter} ${delta.rankAfter} ${delta.lpAfter}LP (${delta.lpChange})`
  );
}

async function pollLiveGame(player: Player): Promise<void> {
  const activeGame = await getActiveGameByPuuid(player.puuid);

  if (!activeGame) {
    if (player.currentGameId) {
      await prisma.player.update({ where: { id: player.id }, data: { currentGameId: null } });
    }
    return;
  }

  const gameId = String(activeGame.gameId);
  if (player.currentGameId === gameId) return;

  await prisma.player.update({ where: { id: player.id }, data: { currentGameId: gameId } });

  if (activeGame.gameQueueConfigId !== RANKED_SOLO_QUEUE_ID) return;

  await prisma.notificationEvent.upsert({
    where: {
      playerId_type_referenceId: { playerId: player.id, type: "LIVE_GAME", referenceId: gameId },
    },
    update: {},
    create: {
      playerId: player.id,
      type: "LIVE_GAME",
      referenceId: gameId,
      payload: {
        gameId,
        gameStartTime: activeGame.gameStartTime,
        gameQueueConfigId: activeGame.gameQueueConfigId,
        participants: activeGame.participants.map((p) => ({
          name: p.riotId,
          championId: p.championId,
          teamId: p.teamId,
          isTracked: p.puuid === player.puuid,
        })),
      },
    },
  });

  console.log(`[poll] ${player.riotId} entrou em partida ranqueada ao vivo (gameId ${gameId}).`);
}
