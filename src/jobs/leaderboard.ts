import { prisma } from "../db/client";
import { rankToValue } from "../riot/rank";
import { sendCard } from "../notifications/discord";
import { buildLeaderboardEmbed, LeaderboardEntry } from "../notifications/leaderboard";
import { buildRankHistory } from "./rankHistory";
import { renderRankHistoryPng } from "../notifications/rankChart";

const DEFAULT_CHALLENGE_START = "2026-08-18";
export const CHALLENGE_START = new Date(
  `${process.env.LEADERBOARD_CHALLENGE_START ?? DEFAULT_CHALLENGE_START}T00:00:00Z`
);

export async function buildLeaderboard(): Promise<LeaderboardEntry[]> {
  const players = await prisma.player.findMany();

  const entries: LeaderboardEntry[] = [];
  for (const player of players) {
    if (!player.tier || !player.rank) continue; // sem entrada ranqueada ainda

    const anchor =
      (await prisma.rankSnapshot.findFirst({
        where: { playerId: player.id, capturedAt: { lte: CHALLENGE_START } },
        orderBy: { capturedAt: "desc" },
      })) ??
      (await prisma.rankSnapshot.findFirst({
        where: { playerId: player.id },
        orderBy: { capturedAt: "asc" },
      }));

    const delta = anchor
      ? rankToValue(player.tier, player.rank, player.lp) - rankToValue(anchor.tier, anchor.rank, anchor.lp)
      : null;

    const matchesSinceStart = await prisma.match.findMany({
      where: { playerId: player.id, playedAt: { gte: CHALLENGE_START }, remake: false },
      select: { win: true },
    });
    const games = matchesSinceStart.length;
    const wins = matchesSinceStart.filter((match) => match.win).length;

    entries.push({ riotId: player.riotId, tier: player.tier, rank: player.rank, lp: player.lp, delta, games, wins });
  }

  entries.sort((a, b) => rankToValue(b.tier, b.rank, b.lp) - rankToValue(a.tier, a.rank, a.lp));
  return entries;
}

export async function postLeaderboard(): Promise<void> {
  const entries = await buildLeaderboard();
  if (entries.length === 0) {
    console.log("[leaderboard] Nenhum player ranqueado ainda — nada pra postar.");
    return;
  }

  const embed = buildLeaderboardEmbed(entries, CHALLENGE_START);

  if (process.env.LEADERBOARD_CHART === "1") {
    try {
      const histories = await buildRankHistory("weekly");
      if (histories.some((h) => h.points.length > 0)) {
        const png = renderRankHistoryPng(histories, "weekly");
        embed.image = { url: "attachment://historico.png" };
        await sendCard(embed, {
          files: [{ name: "historico.png", data: png, contentType: "image/png" }],
        });
        console.log(`[leaderboard] Leaderboard + gráfico postados (${entries.length} player(s)).`);
        return;
      }
    } catch (err) {
      console.error("[leaderboard] Falha ao gerar o gráfico, postando só o texto:", err);
    }
  }

  await sendCard(embed);
  console.log(`[leaderboard] Leaderboard postado (${entries.length} player(s)).`);
}
