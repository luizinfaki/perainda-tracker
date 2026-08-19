import { Player } from "@prisma/client";
import { prisma } from "../db/client";
import {
  getMatchIdsByPuuid,
  getMatchById,
  getLeagueEntriesByPuuid,
  getActiveGameByPuuid,
} from "../riot/endpoints";
import { rankToValue } from "../riot/rank";

const RANKED_SOLO_QUEUE = "RANKED_SOLO_5x5";
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
  await pollRank(player);
  await pollLiveGame(player);
}

async function pollMatches(player: Player): Promise<void> {
  const matchIds = await getMatchIdsByPuuid(player.puuid, { count: MATCHES_PER_POLL });

  const existing = await prisma.match.findMany({
    where: { matchId: { in: matchIds } },
    select: { matchId: true },
  });
  const existingIds = new Set(existing.map((m) => m.matchId));
  const newMatchIds = matchIds.filter((id) => !existingIds.has(id));

  for (const matchId of newMatchIds) {
    const matchDetail = await getMatchById(matchId);
    const participant = matchDetail.info.participants.find((p) => p.puuid === player.puuid);
    if (!participant) continue;

    const playedAt = new Date(matchDetail.info.gameEndTimestamp ?? matchDetail.info.gameCreation);

    await prisma.match.upsert({
      where: { matchId },
      update: {},
      create: {
        matchId,
        playerId: player.id,
        win: participant.win,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        champion: participant.championName,
        playedAt,
      },
    });

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
        },
      },
    });

    console.log(
      `[poll] Nova partida ${matchId} p/ ${player.riotId}: ${participant.championName}, ${participant.win ? "vitória" : "derrota"} (${participant.kills}/${participant.deaths}/${participant.assists})`
    );
  }
}

async function pollRank(player: Player): Promise<void> {
  const entries = await getLeagueEntriesByPuuid(player.puuid);
  const solo = entries.find((entry) => entry.queueType === RANKED_SOLO_QUEUE);
  if (!solo) return;

  const lastSnapshot = await prisma.rankSnapshot.findFirst({
    where: { playerId: player.id },
    orderBy: { capturedAt: "desc" },
  });

  const newValue = rankToValue(solo.tier, solo.rank, solo.leaguePoints);
  const oldValue = lastSnapshot ? rankToValue(lastSnapshot.tier, lastSnapshot.rank, lastSnapshot.lp) : newValue;
  const lpChange = newValue - oldValue;

  await prisma.player.update({
    where: { id: player.id },
    data: { tier: solo.tier, rank: solo.rank, lp: solo.leaguePoints },
  });

  if (!lastSnapshot || lpChange !== 0) {
    const lpBalance = (lastSnapshot?.lpBalance ?? 0) + lpChange;

    const snapshot = await prisma.rankSnapshot.create({
      data: {
        playerId: player.id,
        tier: solo.tier,
        rank: solo.rank,
        lp: solo.leaguePoints,
        lpChange,
        lpBalance,
      },
    });

    if (lastSnapshot) {
      await prisma.notificationEvent.create({
        data: {
          playerId: player.id,
          type: "RANK_CHANGE",
          referenceId: snapshot.id,
          payload: {
            tier: solo.tier,
            rank: solo.rank,
            lp: solo.leaguePoints,
            lpChange,
            lpBalance,
          },
        },
      });
      console.log(
        `[poll] Mudança de rank p/ ${player.riotId}: ${solo.tier} ${solo.rank} ${solo.leaguePoints}LP (${lpChange >= 0 ? "+" : ""}${lpChange}, saldo ${lpBalance})`
      );
    }
  }
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

  await prisma.notificationEvent.upsert({
    where: {
      playerId_type_referenceId: { playerId: player.id, type: "LIVE_GAME", referenceId: gameId },
    },
    update: {},
    create: {
      playerId: player.id,
      type: "LIVE_GAME",
      referenceId: gameId,
      payload: { gameId, gameStartTime: activeGame.gameStartTime },
    },
  });

  console.log(`[poll] ${player.riotId} entrou em partida ao vivo (gameId ${gameId}).`);
}
