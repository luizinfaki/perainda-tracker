import "dotenv/config";
import { writeFileSync } from "node:fs";
import { prisma } from "../db/client";
import { buildRankHistory, Granularity } from "../jobs/rankHistory";
import { renderRankHistoryPng } from "../notifications/rankChart";

const GRAN_ALIASES: Record<string, Granularity> = {
  diario: "daily",
  diário: "daily",
  daily: "daily",
  semanal: "weekly",
  weekly: "weekly",
  mensal: "monthly",
  monthly: "monthly",
};

async function main() {
  const [granArg, riotIdArg] = process.argv.slice(2);
  const granularity = GRAN_ALIASES[(granArg ?? "semanal").toLowerCase()] ?? "weekly";

  let playerIds: string[] | undefined;
  if (riotIdArg) {
    const name = riotIdArg.split("#")[0].trim();
    const player = await prisma.player.findFirst({
      where: { riotId: { equals: name, mode: "insensitive" } },
    });
    if (!player) {
      console.error(`Player "${riotIdArg}" não encontrado.`);
      process.exit(1);
    }
    playerIds = [player.id];
  }

  const histories = await buildRankHistory(granularity, { playerIds });
  console.log(
    histories.map((h) => `${h.riotId}: ${h.points.length} ponto(s)`).join("\n") || "(nenhum player)"
  );

  const png = renderRankHistoryPng(histories, granularity);
  const outPath = "rank-chart.png";
  writeFileSync(outPath, png);
  console.log(`Gráfico salvo em ./${outPath} (${png.length} bytes).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
