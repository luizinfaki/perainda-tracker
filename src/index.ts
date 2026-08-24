import "dotenv/config";
import { ensureBotReady, onInteraction, registerSlashCommands } from "./notifications/discordBot";
import { handleInteraction } from "./notifications/interactions";
import { runPollCycle, startScheduler } from "./jobs/scheduler";

async function main() {
  console.log("Perainda Tracker iniciado.");

  await ensureBotReady();
  onInteraction((interaction) => {
    handleInteraction(interaction).catch((err) => console.error("[discord-bot] Erro ao tratar interação:", err));
  });
  await registerSlashCommands();

  await runPollCycle();
  startScheduler();
}

main().catch((err) => {
  console.error("Erro fatal ao iniciar o serviço:", err);
  process.exit(1);
});
