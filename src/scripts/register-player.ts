import "dotenv/config";
import { NotifyMode } from "@prisma/client";
import { prisma } from "../db/client";
import { getAccountByRiotId, getLeagueEntriesByPuuid } from "../riot/endpoints";

function parseNotifyMode(value: string | undefined): NotifyMode {
  const normalized = (value ?? "REALTIME").toUpperCase();
  if (normalized === "REALTIME" || normalized === "DAILY_SUMMARY") {
    return normalized;
  }
  throw new Error(`Modo inválido: "${value}". Use REALTIME ou DAILY_SUMMARY.`);
}

async function main() {
  const [riotIdArg, modeArg] = process.argv.slice(2);
  if (!riotIdArg || !riotIdArg.includes("#")) {
    console.error("Uso: npx tsx src/scripts/register-player.ts <gameName>#<tagLine> [REALTIME|DAILY_SUMMARY]");
    process.exit(1);
  }

  const [gameName, tagLine] = riotIdArg.split("#");
  const notifyMode = parseNotifyMode(modeArg);

  console.log(`Buscando ${gameName}#${tagLine} na Riot API...`);
  const account = await getAccountByRiotId(gameName, tagLine);

  const leagueEntries = await getLeagueEntriesByPuuid(account.puuid);
  const soloQueue = leagueEntries.find((entry) => entry.queueType === "RANKED_SOLO_5x5");

  const player = await prisma.player.upsert({
    where: { puuid: account.puuid },
    update: {
      riotId: account.gameName,
      tagLine: account.tagLine,
      tier: soloQueue?.tier,
      rank: soloQueue?.rank,
      lp: soloQueue?.leaguePoints ?? 0,
      notifyMode,
    },
    create: {
      riotId: account.gameName,
      tagLine: account.tagLine,
      puuid: account.puuid,
      tier: soloQueue?.tier,
      rank: soloQueue?.rank,
      lp: soloQueue?.leaguePoints ?? 0,
      notifyMode,
    },
  });

  console.log("Player cadastrado:", player);

  const hasSnapshot = await prisma.rankSnapshot.findFirst({ where: { playerId: player.id } });
  if (!hasSnapshot && soloQueue) {
    await prisma.rankSnapshot.create({
      data: {
        playerId: player.id,
        tier: soloQueue.tier,
        rank: soloQueue.rank,
        lp: soloQueue.leaguePoints,
        lpChange: 0,
        lpBalance: 0,
      },
    });
    console.log(`Snapshot inicial de rank criado (baseline): ${soloQueue.tier} ${soloQueue.rank} ${soloQueue.leaguePoints}LP.`);
  } else if (!soloQueue) {
    console.log("Player não tem entrada em Ranked Solo/Duo ainda — sem snapshot inicial de rank.");
  }
}

main()
  .catch((err) => {
    console.error("Erro ao cadastrar player:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
