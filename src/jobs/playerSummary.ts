import { prisma } from "../db/client";
import { CHALLENGE_START, buildLeaderboard } from "./leaderboard";
import { formatTierRank, tierShortCode } from "../riot/rank";
import { saoPauloParts } from "../util/time";
import { MatchAlly } from "../riot/matchDetail";

const WEEKDAY_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export interface ChampAgg {
  champion: string;
  games: number;
  wins: number;
  kda: number;
  avgK: number;
  avgD: number;
  avgA: number;
  csPerMin: number | null;
  killParticipation: number | null;
}

export interface GeneralMetrics {
  games: number;
  wins: number;
  losses: number;
  winRate: number; // 0–100
  avgKda: number;
  avgKillParticipation: number | null; // 0–1
  avgDurationSeconds: number | null;
  lpChange: number | null;
  rankLabel: string; // "Esmeralda 3 68LP"
  rankShort: string; // "E 3 · 68LP"
}

export interface ActivityBucket {
  label: string;
  games: number;
  wins: number;
}

export interface ActivityBuckets {
  byWeekday: ActivityBucket[]; // sempre 7 (seg..dom)
  byHour: ActivityBucket[]; // sempre 24 (0..23)
}

export interface Mate {
  name: string;
  games: number;
  wins: number;
  isTracked: boolean;
}

export interface RoleAgg {
  position: string;
  games: number;
  wins: number;
}

export interface PlayerSummary {
  riotId: string;
  general: GeneralMetrics;
  champions: ChampAgg[];
  activity: ActivityBuckets;
  mates: Mate[];
  roles: RoleAgg[];
  detailCoverage: { withDetail: number; total: number };
}

function ratio(k: number, d: number, a: number): number {
  return d === 0 ? k + a : (k + a) / d;
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

type SummaryMatch = {
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  champion: string;
  playedAt: Date;
  position: string | null;
  cs: number | null;
  durationSeconds: number | null;
  killParticipation: number | null;
  allies: unknown;
};

function buildChampions(matches: SummaryMatch[]): ChampAgg[] {
  const byChamp = new Map<
    string,
    {
      games: number;
      wins: number;
      k: number;
      d: number;
      a: number;
      csSum: number;
      durSum: number;
      csGames: number;
      kpSum: number;
      kpGames: number;
    }
  >();

  for (const m of matches) {
    let agg = byChamp.get(m.champion);
    if (!agg) {
      agg = { games: 0, wins: 0, k: 0, d: 0, a: 0, csSum: 0, durSum: 0, csGames: 0, kpSum: 0, kpGames: 0 };
      byChamp.set(m.champion, agg);
    }
    agg.games++;
    if (m.win) agg.wins++;
    agg.k += m.kills;
    agg.d += m.deaths;
    agg.a += m.assists;
    if (m.cs !== null && m.durationSeconds) {
      agg.csSum += m.cs;
      agg.durSum += m.durationSeconds;
      agg.csGames++;
    }
    if (m.killParticipation !== null) {
      agg.kpSum += m.killParticipation;
      agg.kpGames++;
    }
  }

  return [...byChamp.entries()]
    .filter(([, agg]) => agg.games >= 2)
    .map(([champion, agg]) => ({
      champion,
      games: agg.games,
      wins: agg.wins,
      kda: round(ratio(agg.k, agg.d, agg.a)),
      avgK: round(agg.k / agg.games, 1),
      avgD: round(agg.d / agg.games, 1),
      avgA: round(agg.a / agg.games, 1),
      csPerMin: agg.durSum > 0 ? round((agg.csSum / agg.durSum) * 60, 1) : null,
      killParticipation: agg.kpGames > 0 ? round(agg.kpSum / agg.kpGames, 2) : null,
    }))
    .sort((x, y) => y.games - x.games)
    .slice(0, 12);
}

function buildActivity(matches: SummaryMatch[]): ActivityBuckets {
  const byWeekday: ActivityBucket[] = WEEKDAY_LABELS.map((label) => ({ label, games: 0, wins: 0 }));
  const byHour: ActivityBucket[] = Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, "0")}h`,
    games: 0,
    wins: 0,
  }));

  for (const m of matches) {
    const { weekday, hour } = saoPauloParts(m.playedAt);
    byWeekday[weekday].games++;
    byHour[hour].games++;
    if (m.win) {
      byWeekday[weekday].wins++;
      byHour[hour].wins++;
    }
  }

  return { byWeekday, byHour };
}

function buildMates(matches: SummaryMatch[], trackedNames: Set<string>): Mate[] {
  const byName = new Map<string, { games: number; wins: number }>();

  for (const m of matches) {
    const allies = Array.isArray(m.allies) ? (m.allies as MatchAlly[]) : [];
    for (const ally of allies) {
      if (!ally?.name || ally.name === "?") continue;
      let agg = byName.get(ally.name);
      if (!agg) {
        agg = { games: 0, wins: 0 };
        byName.set(ally.name, agg);
      }
      agg.games++;
      if (m.win) agg.wins++;
    }
  }

  return [...byName.entries()]
    .filter(([, agg]) => agg.games >= 3)
    .map(([name, agg]) => ({
      name,
      games: agg.games,
      wins: agg.wins,
      isTracked: trackedNames.has(name),
    }))
    .sort((x, y) => y.games - x.games)
    .slice(0, 6);
}

function buildRoles(matches: SummaryMatch[]): RoleAgg[] {
  const byRole = new Map<string, { games: number; wins: number }>();
  for (const m of matches) {
    if (!m.position) continue;
    let agg = byRole.get(m.position);
    if (!agg) {
      agg = { games: 0, wins: 0 };
      byRole.set(m.position, agg);
    }
    agg.games++;
    if (m.win) agg.wins++;
  }
  return [...byRole.entries()]
    .map(([position, agg]) => ({ position, ...agg }))
    .sort((x, y) => y.games - x.games);
}

function buildGeneral(
  matches: SummaryMatch[],
  lpChange: number | null,
  rankLabel: string,
  rankShort: string
): GeneralMetrics {
  const games = matches.length;
  const wins = matches.filter((m) => m.win).length;

  let sumK = 0;
  let sumD = 0;
  let sumA = 0;
  let kpSum = 0;
  let kpGames = 0;
  let durSum = 0;
  let durGames = 0;
  for (const m of matches) {
    sumK += m.kills;
    sumD += m.deaths;
    sumA += m.assists;
    if (m.killParticipation !== null) {
      kpSum += m.killParticipation;
      kpGames++;
    }
    if (m.durationSeconds) {
      durSum += m.durationSeconds;
      durGames++;
    }
  }

  return {
    games,
    wins,
    losses: games - wins,
    winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
    avgKda: round(ratio(sumK, sumD, sumA)),
    avgKillParticipation: kpGames > 0 ? round(kpSum / kpGames, 2) : null,
    avgDurationSeconds: durGames > 0 ? Math.round(durSum / durGames) : null,
    lpChange,
    rankLabel,
    rankShort,
  };
}

async function loadMatches(playerId: string): Promise<SummaryMatch[]> {
  return prisma.match.findMany({
    where: { playerId, remake: false, playedAt: { gte: CHALLENGE_START } },
    select: {
      win: true,
      kills: true,
      deaths: true,
      assists: true,
      champion: true,
      playedAt: true,
      position: true,
      cs: true,
      durationSeconds: true,
      killParticipation: true,
      allies: true,
    },
  });
}

function assemble(
  riotId: string,
  matches: SummaryMatch[],
  lpChange: number | null,
  rankLabel: string,
  rankShort: string,
  trackedNames: Set<string>
): PlayerSummary {
  const withDetail = matches.filter((m) => m.durationSeconds !== null).length;
  return {
    riotId,
    general: buildGeneral(matches, lpChange, rankLabel, rankShort),
    champions: buildChampions(matches),
    activity: buildActivity(matches),
    mates: buildMates(matches, trackedNames),
    roles: buildRoles(matches),
    detailCoverage: { withDetail, total: matches.length },
  };
}

async function trackedNameSet(): Promise<Set<string>> {
  const players = await prisma.player.findMany({ select: { riotId: true } });
  return new Set(players.map((p) => p.riotId));
}

function rankLabels(player: { tier: string | null; rank: string | null; lp: number }): {
  rankLabel: string;
  rankShort: string;
} {
  if (!player.tier || !player.rank) return { rankLabel: "Unranked", rankShort: "Unranked" };
  return {
    rankLabel: `${formatTierRank(player.tier, player.rank)} ${player.lp}LP`,
    rankShort: `${tierShortCode(player.tier, player.rank)} · ${player.lp}LP`,
  };
}

export async function buildPlayerSummary(playerId: string): Promise<PlayerSummary | null> {
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) return null;

  const [matches, leaderboard, trackedNames] = await Promise.all([
    loadMatches(playerId),
    buildLeaderboard(),
    trackedNameSet(),
  ]);

  const entry = leaderboard.find((e) => e.riotId === player.riotId);
  const { rankLabel, rankShort } = rankLabels(player);

  return assemble(player.riotId, matches, entry?.delta ?? null, rankLabel, rankShort, trackedNames);
}

export async function buildGroupSummary(): Promise<PlayerSummary[]> {
  const [players, leaderboard, trackedNames] = await Promise.all([
    prisma.player.findMany({ orderBy: { riotId: "asc" } }),
    buildLeaderboard(),
    trackedNameSet(),
  ]);

  const summaries = await Promise.all(
    players.map(async (player) => {
      const matches = await loadMatches(player.id);
      const entry = leaderboard.find((e) => e.riotId === player.riotId);
      const { rankLabel, rankShort } = rankLabels(player);
      return assemble(player.riotId, matches, entry?.delta ?? null, rankLabel, rankShort, trackedNames);
    })
  );

  // Ordena pelo mesmo critério do leaderboard (mais forte primeiro).
  const order = new Map(leaderboard.map((e, i) => [e.riotId, i]));
  return summaries.sort(
    (a, b) => (order.get(a.riotId) ?? 99) - (order.get(b.riotId) ?? 99)
  );
}
