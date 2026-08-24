import cron from "node-cron";
import { pollAllPlayers } from "./pollPlayers";
import { dispatchRealtimeNotifications, dispatchDailySummaries } from "./dispatchNotifications";
import { postLeaderboard } from "./leaderboard";

const POLL_CRON_EXPRESSION = process.env.POLL_CRON_EXPRESSION ?? "*/5 * * * *";
const DAILY_SUMMARY_CRON_EXPRESSION = process.env.DAILY_SUMMARY_CRON_EXPRESSION ?? "0 22 * * *";
const LEADERBOARD_CRON_EXPRESSION = process.env.LEADERBOARD_CRON_EXPRESSION ?? "0 20 * * *";

export async function runPollCycle(): Promise<void> {
  await pollAllPlayers();
  await dispatchRealtimeNotifications();
}

export function startScheduler(): void {
  console.log(`[scheduler] Polling agendado com a expressão cron "${POLL_CRON_EXPRESSION}".`);
  cron.schedule(POLL_CRON_EXPRESSION, () => {
    runPollCycle().catch((err) => console.error("[scheduler] Erro no ciclo de polling:", err));
  });

  console.log(`[scheduler] Resumo diário agendado com a expressão cron "${DAILY_SUMMARY_CRON_EXPRESSION}".`);
  cron.schedule(DAILY_SUMMARY_CRON_EXPRESSION, () => {
    dispatchDailySummaries().catch((err) => console.error("[scheduler] Erro no resumo diário:", err));
  });

  console.log(`[scheduler] Leaderboard diário agendado com a expressão cron "${LEADERBOARD_CRON_EXPRESSION}".`);
  cron.schedule(LEADERBOARD_CRON_EXPRESSION, () => {
    postLeaderboard().catch((err) => console.error("[scheduler] Erro ao postar leaderboard:", err));
  });
}
