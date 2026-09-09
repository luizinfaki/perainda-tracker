import { DiscordEmbed } from "./discord";
import { formatTierRank } from "../riot/rank";

export interface LeaderboardEntry {
  riotId: string;
  tier: string;
  rank: string;
  lp: number;
  delta: number | null;
  games: number;
  wins: number;
}

const MEDALS = ["🥇", "🥈", "🥉"];
const COLOR_GOLD = 0xf1c40f;

function formatDelta(delta: number | null): string {
  if (delta === null) return "";
  if (delta === 0) return " (±0)";
  return ` (${delta > 0 ? "+" : ""}${delta})`;
}

function formatWinrate(entry: LeaderboardEntry): string {
  if (entry.games === 0) return " • sem partidas";
  const losses = entry.games - entry.wins;
  const pct = Math.round((entry.wins / entry.games) * 100);
  return ` • ${pct}% (${entry.wins}V/${losses}D)`;
}

export function buildLeaderboardEmbed(entries: LeaderboardEntry[], challengeStart: Date): DiscordEmbed {
  const dateLabel = challengeStart.toLocaleDateString("pt-BR", { timeZone: "UTC" });

  const lines = entries.map((entry, index) => {
    const position = MEDALS[index] ?? `${index + 1}.`;
    return `${position} **${entry.riotId}** — ${formatTierRank(entry.tier, entry.rank)} ${entry.lp}LP${formatDelta(entry.delta)}${formatWinrate(entry)}`;
  });

  return {
    title: "🏆 Leaderboard — Ranked Solo/Duo",
    description: `Variação de PDL desde ${dateLabel}\n\n${lines.join("\n")}`,
    color: COLOR_GOLD,
    footer: { text: "Perainda Tracker" },
    timestamp: new Date().toISOString(),
  };
}
