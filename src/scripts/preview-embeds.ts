import "dotenv/config";
import { getMatchById, getActiveGameByPuuid } from "../riot/endpoints";
import { sendCard } from "../notifications/discord";
import { buildEventEmbed } from "../notifications/formatMessage";
import { ScoreboardParticipant, LobbyParticipant } from "../notifications/dataDragon";

const LIVE_PLAYER_PUUID = "tb3OiUHPg63zspFE2ZiYIVlJ5moDzJ9MyaR3SXrmqsiJ7hh567cNFlHBeZEqdTqWEgbnbuTCwzVzzw"; // Srprepucio

// Partida real usada como exemplo (garante que os IDs de item/campeão são válidos de verdade).
const SAMPLE_MATCH_ID = "BR1_3273811999";
const SAMPLE_RIOT_ID = "Trakinas2202";

async function main() {
  const match = await getMatchById(SAMPLE_MATCH_ID);
  const tracked = match.info.participants.find((p) => p.riotIdGameName === SAMPLE_RIOT_ID);
  if (!tracked) {
    throw new Error(`Player ${SAMPLE_RIOT_ID} não encontrado na partida ${SAMPLE_MATCH_ID}.`);
  }

  const participants: ScoreboardParticipant[] = match.info.participants.map((p) => ({
    name: p.riotIdGameName || "?",
    champion: p.championName,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    teamId: p.teamId,
    win: p.win,
    items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6],
    isTracked: p.riotIdGameName === SAMPLE_RIOT_ID,
  }));

  const win = await buildEventEmbed(SAMPLE_RIOT_ID, {
    id: "preview-win",
    type: "MATCH",
    payload: {
      champion: tracked.championName,
      win: tracked.win,
      kills: tracked.kills,
      deaths: tracked.deaths,
      assists: tracked.assists,
      playedAt: new Date(match.info.gameEndTimestamp ?? match.info.gameCreation).toISOString(),
      position: tracked.teamPosition,
      level: tracked.champLevel,
      killParticipation: tracked.challenges?.killParticipation ?? null,
      cs: tracked.totalMinionsKilled + tracked.neutralMinionsKilled,
      damage: tracked.totalDamageDealtToChampions,
      durationSeconds: match.info.gameDuration,
      items: [tracked.item0, tracked.item1, tracked.item2, tracked.item3, tracked.item4, tracked.item5, tracked.item6],
      goldEarned: tracked.goldEarned,
      visionScore: tracked.visionScore,
      wardsPlaced: tracked.wardsPlaced,
      wardsKilled: tracked.wardsKilled,
      totalDamageTaken: tracked.totalDamageTaken,
      totalHeal: tracked.totalHeal,
      multikill: tracked.pentaKills > 0 ? "Pentakill!" : tracked.tripleKills > 0 ? "Triplekill!" : null,
      // dados de LP fictícios só pra ilustrar o layout (essa partida real não tem histórico de rank associado)
      rank: {
        tierBefore: "EMERALD",
        rankBefore: "III",
        lpBefore: 55,
        tierAfter: "EMERALD",
        rankAfter: "III",
        lpAfter: 85,
        lpChange: 30,
        lpBalance: 85,
      },
      winsTracked: 9,
      totalTracked: 14,
      participants,
    },
  });
  await sendCard(win.embed, { files: win.files, buttons: win.buttons });

  const activeGame = await getActiveGameByPuuid(LIVE_PLAYER_PUUID);
  if (activeGame) {
    const lobbyParticipants: LobbyParticipant[] = activeGame.participants.map((p) => ({
      name: p.riotId,
      championId: p.championId,
      teamId: p.teamId,
      isTracked: p.puuid === LIVE_PLAYER_PUUID,
    }));

    const live = await buildEventEmbed("Srprepucio", {
      id: "preview-live",
      type: "LIVE_GAME",
      payload: {
        gameId: String(activeGame.gameId),
        gameStartTime: activeGame.gameStartTime,
        gameQueueConfigId: activeGame.gameQueueConfigId,
        participants: lobbyParticipants,
      },
    });
    await sendCard(live.embed, { files: live.files });
  } else {
    console.log("Ninguém em partida ao vivo agora — pulei o exemplo de LIVE_GAME.");
  }

  console.log("Cards de exemplo enviados.");
}

main().then(() => process.exit(0));
