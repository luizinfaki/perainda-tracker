import "dotenv/config";
import {
  getAccountByRiotId,
  getSummonerByPuuid,
  getLeagueEntriesByPuuid,
  getMatchIdsByPuuid,
  getMatchById,
  getActiveGameByPuuid,
} from "./endpoints";

async function main() {
  const [gameName, tagLine] = process.argv.slice(2);
  if (!gameName || !tagLine) {
    console.error("Uso: npx tsx src/riot/manual-test.ts <gameName> <tagLine>");
    process.exit(1);
  }

  console.log(`Buscando conta de ${gameName}#${tagLine}...`);
  const account = await getAccountByRiotId(gameName, tagLine);
  console.log("Account:", account);

  const summoner = await getSummonerByPuuid(account.puuid);
  console.log("Summoner:", summoner);

  const leagueEntries = await getLeagueEntriesByPuuid(account.puuid);
  console.log("League entries:", leagueEntries);

  const matchIds = await getMatchIdsByPuuid(account.puuid, { count: 5 });
  console.log("Últimas partidas:", matchIds);

  if (matchIds[0]) {
    const match = await getMatchById(matchIds[0]);
    console.log(
      `Detalhe da partida ${matchIds[0]}: ${match.info.participants.length} participantes, criada em ${new Date(match.info.gameCreation).toISOString()}`
    );
  }

  const activeGame = await getActiveGameByPuuid(account.puuid);
  console.log("Em partida ao vivo agora:", activeGame ? "SIM" : "NÃO");
}

main().catch((err) => {
  console.error("Erro no teste manual:", err);
  process.exit(1);
});
