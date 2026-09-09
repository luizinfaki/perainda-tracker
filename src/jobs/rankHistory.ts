import { RankSnapshot } from "@prisma/client";
import { prisma } from "../db/client";
import { rankToValue } from "../riot/rank";
import { saoPauloYmd, saoPauloMidnight } from "../util/time";

export type Granularity = "daily" | "weekly" | "monthly";

export const GRANULARITY_PT: Record<Granularity, string> = {
  daily: "diário",
  weekly: "semanal",
  monthly: "mensal",
};

/** Quanto de histórico puxar por modo. Os dados são rasos (~semanas), então nem precisa de muito. */
const RANGE_DAYS: Record<Granularity, number> = {
  daily: 30,
  weekly: 7 * 16,
  monthly: 366,
};

export interface HistoryPoint {
  /** Início do período (segunda-feira / dia / 1º do mês) — usado como rótulo do eixo x. */
  periodStart: Date;
  label: string; // "dd/mm"
  value: number; // rankToValue(tier, rank, lp)
  tier: string;
  rank: string;
  lp: number;
}

export interface PlayerHistory {
  playerId: string;
  riotId: string;
  points: HistoryPoint[];
  current: { tier: string; rank: string; lp: number; value: number } | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface Period {
  key: string;
  start: Date;
}

function periodOf(d: Date, g: Granularity): Period {
  const [y, m, day] = saoPauloYmd(d);

  if (g === "monthly") {
    return { key: `${y}-${pad(m)}`, start: saoPauloMidnight(y, m, 1) };
  }
  if (g === "daily") {
    return { key: `${y}-${pad(m)}-${pad(day)}`, start: saoPauloMidnight(y, m, day) };
  }

  // weekly: segunda-feira da semana local
  const midnight = saoPauloMidnight(y, m, day);
  const dowMondayZero = (midnight.getUTCDay() + 6) % 7; // getUTCDay: 0=domingo -> 0=segunda
  const monday = new Date(midnight.getTime() - dowMondayZero * 86_400_000);
  const [wy, wm, wd] = saoPauloYmd(monday);
  return { key: `${wy}-${pad(wm)}-${pad(wd)}`, start: saoPauloMidnight(wy, wm, wd) };
}

function labelFor(start: Date): string {
  const [, m, day] = saoPauloYmd(start);
  return `${pad(day)}/${pad(m)}`;
}

/**
 * Monta a série de rank ao longo do tempo pra cada player. Os RankSnapshot são gravados só
 * quando o PDL muda (event-sourced), então aqui a gente:
 *   1. agrupa os snapshots por período (dia/semana/mês) no fuso de São Paulo;
 *   2. usa o eixo x = união dos períodos com dado de qualquer player;
 *   3. faz forward-fill (carrega o último valor conhecido) pra alinhar as séries;
 *   4. o último ponto sempre reflete o rank corrente do Player.
 */
export async function buildRankHistory(
  granularity: Granularity,
  opts: { playerIds?: string[] } = {}
): Promise<PlayerHistory[]> {
  const players = await prisma.player.findMany({
    where: opts.playerIds ? { id: { in: opts.playerIds } } : undefined,
    orderBy: { riotId: "asc" },
  });
  if (players.length === 0) return [];

  const rangeStart = new Date(Date.now() - RANGE_DAYS[granularity] * 86_400_000);
  const nowPeriod = periodOf(new Date(), granularity);

  // Coleta por player: snapshots no range + âncora (último antes do range, pro valor inicial).
  const perPlayer = new Map<
    string,
    { snapshots: RankSnapshot[]; anchor: RankSnapshot | null }
  >();
  const periodStarts = new Map<string, Date>([[nowPeriod.key, nowPeriod.start]]);

  for (const player of players) {
    const snapshots = await prisma.rankSnapshot.findMany({
      where: { playerId: player.id, capturedAt: { gte: rangeStart } },
      orderBy: { capturedAt: "asc" },
    });
    const anchor = await prisma.rankSnapshot.findFirst({
      where: { playerId: player.id, capturedAt: { lt: rangeStart } },
      orderBy: { capturedAt: "desc" },
    });
    perPlayer.set(player.id, { snapshots, anchor });

    for (const snap of snapshots) {
      const p = periodOf(snap.capturedAt, granularity);
      periodStarts.set(p.key, p.start);
    }
  }

  const axis = [...periodStarts.entries()]
    .map(([key, start]) => ({ key, start }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const histories: PlayerHistory[] = [];

  for (const player of players) {
    const { snapshots, anchor } = perPlayer.get(player.id)!;

    // Último snapshot de cada período (o que "vale" pro fim daquele período).
    const lastInPeriod = new Map<string, RankSnapshot>();
    for (const snap of snapshots) {
      lastInPeriod.set(periodOf(snap.capturedAt, granularity).key, snap);
    }

    const current =
      player.tier && player.rank
        ? {
            tier: player.tier,
            rank: player.rank,
            lp: player.lp,
            value: rankToValue(player.tier, player.rank, player.lp),
          }
        : null;

    let carried: { tier: string; rank: string; lp: number } | null = anchor
      ? { tier: anchor.tier, rank: anchor.rank, lp: anchor.lp }
      : null;

    const points: HistoryPoint[] = [];
    for (const period of axis) {
      const snap = lastInPeriod.get(period.key);
      if (snap) carried = { tier: snap.tier, rank: snap.rank, lp: snap.lp };
      if (!carried) continue; // player ainda não tinha rank nesse período

      const isCurrentPeriod = period.key === nowPeriod.key;
      const source = isCurrentPeriod && current ? current : carried;

      points.push({
        periodStart: period.start,
        label: labelFor(period.start),
        value: rankToValue(source.tier, source.rank, source.lp),
        tier: source.tier,
        rank: source.rank,
        lp: source.lp,
      });
    }

    // Garante que o período corrente aparece mesmo sem snapshot nem âncora (player recém-visto).
    if (current && (points.length === 0 || points[points.length - 1].periodStart.getTime() !== nowPeriod.start.getTime())) {
      points.push({
        periodStart: nowPeriod.start,
        label: labelFor(nowPeriod.start),
        value: current.value,
        tier: current.tier,
        rank: current.rank,
        lp: current.lp,
      });
    }

    histories.push({ playerId: player.id, riotId: player.riotId, points, current });
  }

  return histories;
}
