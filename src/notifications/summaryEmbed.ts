import { DiscordEmbed } from "./discord";
import { tierShortCode } from "../riot/rank";
import { PlayerSummary, ActivityBucket } from "../jobs/playerSummary";

const COLOR = 0x1f8b4c;
const FOOTER_SUFFIX = "ranqueada solo/duo · desde 18/08";

const ROLE_SHORT: Record<string, string> = {
  TOP: "TOP",
  JUNGLE: "JG",
  MIDDLE: "MID",
  BOTTOM: "BOT",
  UTILITY: "SUP",
};

const SPARK = "▁▂▃▄▅▆▇█";

function bar(value: number, max: number, width: number): string {
  if (max <= 0) return "";
  const filled = Math.round((value / max) * width);
  return "█".repeat(Math.max(value > 0 ? 1 : 0, filled));
}

function spark(values: number[]): string {
  const max = Math.max(...values, 1);
  return values
    .map((v) => (v === 0 ? "·" : SPARK[Math.min(SPARK.length - 1, Math.floor((v / max) * (SPARK.length - 1)))]))
    .join("");
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Janela de 3h consecutivas com mais jogos. */
function peakWindow(byHour: ActivityBucket[]): { start: number; games: number } {
  let best = { start: 0, games: -1 };
  for (let h = 0; h < 24; h++) {
    const games = byHour[h].games + byHour[(h + 1) % 24].games + byHour[(h + 2) % 24].games;
    if (games > best.games) best = { start: h, games };
  }
  return best;
}

function lpad(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}
function rpad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

function championsBlock(s: PlayerSummary): string {
  const line = (
    champ: string,
    g: string,
    vd: string,
    wr: string,
    kda: string,
    cs: string,
    kp: string
  ): string => rpad(champ, 12) + lpad(g, 4) + lpad(vd, 8) + lpad(wr, 6) + lpad(kda, 6) + lpad(cs, 6) + lpad(kp, 5);

  const rows = s.champions
    .slice(0, 10)
    .map((c) =>
      line(
        c.champion,
        String(c.games),
        `${c.wins}-${c.games - c.wins}`,
        `${pct(c.wins, c.games)}%`,
        c.kda.toFixed(2),
        c.csPerMin !== null ? c.csPerMin.toFixed(1) : "—",
        c.killParticipation !== null ? `${Math.round(c.killParticipation * 100)}%` : "—"
      )
    );

  const header = line("Campeão", "J", "V-D", "WR", "KDA", "CS/m", "KP%");
  return "```\n" + [header, ...rows].join("\n") + "\n```";
}

function activityBlock(s: PlayerSummary): string {
  const wk = s.activity.byWeekday;
  const maxWk = Math.max(...wk.map((d) => d.games), 1);
  const wkLines = wk.map(
    (d) => `${d.label} ${bar(d.games, maxWk, 10).padEnd(10)} ${String(d.games).padStart(2)}  ${pct(d.wins, d.games)}%`
  );

  const hourSpark = spark(s.activity.byHour.map((h) => h.games));
  const peak = peakWindow(s.activity.byHour);
  const peakLabel = `${String(peak.start).padStart(2, "0")}h–${String((peak.start + 3) % 24).padStart(2, "0")}h`;
  const hourAxis = "0h" + " ".repeat(4) + "6h" + " ".repeat(4) + "12h" + " ".repeat(3) + "18h" + " ".repeat(3) + "23h";

  return (
    "```\n" +
    wkLines.join("\n") +
    "\n\n" +
    hourAxis +
    "\n" +
    hourSpark +
    `\npico: ${peakLabel} (${peak.games} jogos)\n` +
    "```"
  );
}

function matesValue(s: PlayerSummary): string {
  if (s.mates.length === 0) return "_sem parceiros recorrentes_";
  return s.mates
    .map((m) => `${m.isTracked ? "★ " : "• "}${m.name} — ${m.wins}V-${m.games - m.wins}D (${m.games}j)`)
    .join("\n");
}

function rolesValue(s: PlayerSummary): string {
  const total = s.roles.reduce((sum, r) => sum + r.games, 0);
  if (total === 0) return "—";
  return s.roles
    .map((r) => `${ROLE_SHORT[r.position] ?? r.position} ${pct(r.games, total)}% (${pct(r.wins, r.games)}WR)`)
    .join(" · ");
}

function metricsValue(s: PlayerSummary): string {
  const g = s.general;
  const kp = g.avgKillParticipation !== null ? `${Math.round(g.avgKillParticipation * 100)}%` : "—";
  const dur = g.avgDurationSeconds !== null ? fmtDuration(g.avgDurationSeconds) : "—";
  return [
    `KDA médio: **${g.avgKda.toFixed(2)}**`,
    `Participação em abates: **${kp}**`,
    `Duração média: **${dur}**`,
  ].join("\n");
}

export function buildPlayerSummaryEmbed(s: PlayerSummary): DiscordEmbed {
  const g = s.general;
  const lp = g.lpChange !== null ? `${g.lpChange >= 0 ? "+" : ""}${g.lpChange} PDL` : "— PDL";

  const fields = [
    { name: "Métricas", value: metricsValue(s) },
    { name: "Campeões", value: championsBlock(s) },
    { name: "Atividade (fuso SP)", value: activityBlock(s) },
    { name: "Jogou com", value: matesValue(s), inline: true },
    { name: "Rotas", value: rolesValue(s), inline: true },
  ];

  return {
    title: `📋 Resumo — ${s.riotId}`,
    description: `**${g.rankLabel}** · ${g.games}J ${g.wins}V/${g.losses}D (${g.winRate}%) · ${lp} desde 18/08`,
    color: COLOR,
    fields,
    footer: {
      text: `Estatísticas de ${s.detailCoverage.withDetail}/${s.detailCoverage.total} partidas · ${FOOTER_SUFFIX}`,
    },
  };
}

export function buildGroupSummaryEmbed(list: PlayerSummary[]): DiscordEmbed {
  if (list.length === 0) {
    return { title: "📋 Resumo do grupo", description: "Nenhum player cadastrado ainda.", color: COLOR };
  }

  const nameW = Math.max(...list.map((s) => s.riotId.length));
  const rankW = Math.max(...list.map((s) => s.general.rankShort.length));
  const table = list
    .map((s) => {
      const g = s.general;
      const lp = g.lpChange !== null ? `${g.lpChange >= 0 ? "+" : ""}${g.lpChange}` : "—";
      return (
        rpad(s.riotId, nameW) +
        "  " +
        rpad(g.rankShort, rankW) +
        lpad(`${g.winRate}%`, 6) +
        lpad(`${g.wins}-${g.losses}`, 8) +
        lpad(`KDA ${g.avgKda.toFixed(2)}`, 10) +
        lpad(`${lp} PDL`, 9)
      );
    })
    .join("\n");

  const fields = list.map((s) => {
    const topChamps = s.champions
      .slice(0, 3)
      .map((c) => `${c.champion} ${pct(c.wins, c.games)}% (${c.games}j)`)
      .join("\n");
    const topMate = s.mates[0]
      ? `\nParceiro: ${s.mates[0].name} (${s.mates[0].games}j)`
      : "";
    const mainRole = s.roles[0] ? `\nRota: ${ROLE_SHORT[s.roles[0].position] ?? s.roles[0].position}` : "";
    return {
      name: s.riotId,
      value: (topChamps || "_sem dados_") + topMate + mainRole,
      inline: true,
    };
  });

  return {
    title: "📋 Resumo do grupo — desde 18/08",
    description: "```\n" + table + "\n```",
    color: COLOR,
    fields,
    footer: { text: FOOTER_SUFFIX },
  };
}
