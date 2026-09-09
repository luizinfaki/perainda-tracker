import "dotenv/config";
import { prisma } from "../db/client";
import { getMatchIdsByPuuid, getMatchById } from "../riot/endpoints";
import { extractMatchDetail, detailColumns } from "../riot/matchDetail";
import { CHALLENGE_START } from "../jobs/leaderboard";

const RANKED_SOLO_QUEUE_ID = 420;
const PAGE = 100;

/** Todos os matchIds de ranqueada solo do player desde o início do desafio (paginado). */
async function collectMatchIds(puuid: string): Promise<string[]> {
  const startTime = Math.floor(CHALLENGE_START.getTime() / 1000);
  const ids: string[] = [];
  for (let start = 0; ; start += PAGE) {
    const page = await getMatchIdsByPuuid(puuid, {
      queue: RANKED_SOLO_QUEUE_ID,
      startTime,
      start,
      count: PAGE,
    });
    ids.push(...page);
    if (page.length < PAGE) break;
  }
  return ids;
}

async function main() {
  const refetchAll = process.argv.includes("--all");
  const players = await prisma.player.findMany();

  let created = 0;
  let enriched = 0;
  let skipped = 0;

  for (const player of players) {
    console.log(`\n[backfill] ${player.riotId}#${player.tagLine}`);
    const matchIds = await collectMatchIds(player.puuid);
    console.log(
      `[backfill]   ${matchIds.length} partida(s) desde ${CHALLENGE_START.toISOString().slice(0, 10)}`
    );

    const existing = await prisma.match.findMany({
      where: { playerId: player.id, matchId: { in: matchIds } },
      select: { matchId: true, detailFetchedAt: true },
    });
    const existingMap = new Map(existing.map((m) => [m.matchId, m.detailFetchedAt]));

    let done = 0;
    for (const matchId of matchIds) {
      const isNew = !existingMap.has(matchId);
      const alreadyDetailed = !!existingMap.get(matchId);
      if (!isNew && alreadyDetailed && !refetchAll) {
        skipped++;
        continue;
      }

      const match = await getMatchById(matchId);
      const detail = extractMatchDetail(match, player.puuid);
      if (!detail) {
        console.warn(`[backfill]   ${matchId}: player não encontrado na partida, pulando`);
        continue;
      }

      const data = detailColumns(detail);

      await prisma.match.upsert({
        where: { playerId_matchId: { playerId: player.id, matchId } },
        update: data,
        create: {
          matchId,
          playerId: player.id,
          win: detail.win,
          kills: detail.kills,
          deaths: detail.deaths,
          assists: detail.assists,
          champion: detail.champion,
          playedAt: detail.playedAt,
          remake: detail.remake,
          ...data,
        },
      });

      if (isNew) created++;
      else enriched++;

      done++;
      if (done % 20 === 0) console.log(`[backfill]   ${done} processada(s)...`);
    }
  }

  console.log(
    `\n[backfill] Concluído. ${created} criada(s), ${enriched} enriquecida(s), ${skipped} já estavam ok.`
  );
}

main()
  .catch((err) => {
    console.error("[backfill] Erro:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
