import cron from "node-cron";
import { pollAllPlayers } from "./pollPlayers";

const CRON_EXPRESSION = process.env.POLL_CRON_EXPRESSION ?? "*/5 * * * *";

export function startScheduler(): void {
  console.log(`[scheduler] Polling agendado com a expressão cron "${CRON_EXPRESSION}".`);
  cron.schedule(CRON_EXPRESSION, () => {
    pollAllPlayers().catch((err) => console.error("[scheduler] Erro no polling agendado:", err));
  });
}
