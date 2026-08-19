import "dotenv/config";
import { pollAllPlayers } from "./jobs/pollPlayers";
import { startScheduler } from "./jobs/scheduler";

async function main() {
  console.log("Perainda Tracker iniciado.");
  await pollAllPlayers();
  startScheduler();
}

main().catch((err) => {
  console.error("Erro fatal ao iniciar o serviço:", err);
  process.exit(1);
});
