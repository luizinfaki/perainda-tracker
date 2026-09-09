import "dotenv/config";
import { prisma } from "../db/client";
import { buildPlayerSummary, buildGroupSummary } from "../jobs/playerSummary";
import { buildPlayerSummaryEmbed, buildGroupSummaryEmbed } from "../notifications/summaryEmbed";
import { DiscordEmbed } from "../notifications/discord";

function printEmbed(embed: DiscordEmbed): void {
  console.log("\n" + "=".repeat(60));
  console.log(embed.title ?? "");
  if (embed.description) console.log(embed.description);
  for (const f of embed.fields ?? []) {
    console.log(`\n── ${f.name} ${f.inline ? "(inline)" : ""}`);
    console.log(f.value);
  }
  if (embed.footer) console.log(`\n${embed.footer.text}`);
  console.log("=".repeat(60));
}

async function main() {
  const riotIdArg = process.argv[2];

  if (riotIdArg) {
    const name = riotIdArg.split("#")[0].trim();
    const player = await prisma.player.findFirst({
      where: { riotId: { equals: name, mode: "insensitive" } },
    });
    if (!player) {
      console.error(`Player "${riotIdArg}" não encontrado.`);
      process.exit(1);
    }
    const summary = await buildPlayerSummary(player.id);
    if (!summary) {
      console.error("Sem resumo.");
      process.exit(1);
    }
    console.dir(summary, { depth: null });
    printEmbed(buildPlayerSummaryEmbed(summary));
    return;
  }

  const summaries = await buildGroupSummary();
  console.dir(
    summaries.map((s) => ({ riotId: s.riotId, ...s.general, champs: s.champions.length })),
    { depth: null }
  );
  printEmbed(buildGroupSummaryEmbed(summaries));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
