import { NotificationType } from "@prisma/client";
import { DiscordButtonSpec, DiscordEmbed, DiscordFile } from "./discord";
import {
  championIconUrl,
  buildItemsMontage,
  buildScoreboardImage,
  ScoreboardParticipant,
  buildLobbyImage,
  LobbyParticipant,
  queueDescription,
} from "./dataDragon";

interface RankInfo {
  tierBefore: string;
  rankBefore: string;
  lpBefore: number;
  tierAfter: string;
  rankAfter: string;
  lpAfter: number;
  lpChange: number;
  lpBalance: number;
}

interface MatchPayload {
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  playedAt: string;
  position: string;
  level: number;
  killParticipation: number | null;
  cs: number;
  damage: number;
  durationSeconds: number;
  items: number[];
  goldEarned: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  totalDamageTaken: number;
  totalHeal: number;
  multikill: string | null;
  remake: boolean;
  rank: RankInfo | null;
  winsTracked: number;
  totalTracked: number;
  participants: ScoreboardParticipant[];
}

interface RankChangePayload {
  tier: string;
  rank: string;
  lp: number;
  lpChange: number;
  lpBalance: number;
  winsTracked: number;
  totalTracked: number;
}

interface LiveGamePayload {
  gameId: string;
  gameStartTime: number;
  gameQueueConfigId: number;
  participants: LobbyParticipant[];
}

export interface FormattableEvent {
  id: string;
  type: NotificationType;
  payload: unknown;
}

export interface EventEmbedResult {
  embed: DiscordEmbed;
  files?: DiscordFile[];
  buttons?: DiscordButtonSpec[];
}

const COLOR_WIN = 0x2ecc71;
const COLOR_LOSS = 0xe74c3c;
const COLOR_LIVE = 0x3498db;
const FOOTER = { text: "Perainda Tracker" };

const TIER_LABELS: Record<string, string> = {
  IRON: "Ferro",
  BRONZE: "Bronze",
  SILVER: "Prata",
  GOLD: "Ouro",
  PLATINUM: "Platina",
  EMERALD: "Esmeralda",
  DIAMOND: "Diamante",
  MASTER: "Mestre",
  GRANDMASTER: "Grão-Mestre",
  CHALLENGER: "Desafiante",
};

const DIVISION_LABELS: Record<string, string> = { IV: "4", III: "3", II: "2", I: "1" };
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

/** Ex: "EMERALD"+"III" -> "Esmeralda 3". Tiers sem divisão (Mestre+) não mostram número. */
export function formatTierRank(tier: string, rank: string): string {
  const tierLabel = TIER_LABELS[tier.toUpperCase()] ?? tier;
  if (APEX_TIERS.has(tier.toUpperCase())) return tierLabel;
  const divisionLabel = DIVISION_LABELS[rank.toUpperCase()] ?? rank;
  return `${tierLabel} ${divisionLabel}`;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function summaryLine(p: MatchPayload): string {
  const resultado = p.win ? "**VITÓRIA** ✅" : "**DERROTA** ❌";
  const kdaLine = `### ${p.kills}/${p.deaths}/${p.assists}`;
  const statsLine = `${p.cs} CS  •  ${formatDuration(p.durationSeconds)}  •  ${resultado}`;
  return `${kdaLine}\n${statsLine}`;
}

type MatchView = "summary" | "details" | "scoreboard";

const VIEW_LABELS: Record<MatchView, string> = {
  summary: "Resumo",
  details: "Ver detalhes",
  scoreboard: "Ver placar",
};

function buttonsForView(eventId: string, current: MatchView): DiscordButtonSpec[] {
  return (Object.keys(VIEW_LABELS) as MatchView[])
    .filter((view) => view !== current)
    .map((view) => ({ customId: `match:${view}:${eventId}`, label: VIEW_LABELS[view], style: "Secondary" }));
}

async function buildScoreboardCard(riotId: string, event: FormattableEvent): Promise<EventEmbedResult> {
  const p = event.payload as MatchPayload;
  const image = await buildScoreboardImage(p.participants);
  const fileName = `scoreboard_${event.id}.png`;

  const embed: DiscordEmbed = {
    title: `📊 Placar completo — ${riotId}`,
    description: `Ranked Solo/Duo  •  ${formatDuration(p.durationSeconds)}`,
    color: p.win ? COLOR_WIN : COLOR_LOSS,
    image: { url: `attachment://${fileName}` },
    footer: FOOTER,
  };

  return {
    embed,
    files: [{ name: fileName, data: image, contentType: "image/png" }],
    buttons: buttonsForView(event.id, "scoreboard"),
  };
}

async function buildMatchCard(
  riotId: string,
  event: FormattableEvent,
  view: MatchView,
  fileIndex: number
): Promise<EventEmbedResult> {
  if (view === "scoreboard") {
    return buildScoreboardCard(riotId, event);
  }

  const p = event.payload as MatchPayload;

  let title: string;
  let description: string;

  if (p.rank) {
    const ganhou = p.rank.lpChange >= 0;
    const antes = formatTierRank(p.rank.tierBefore, p.rank.rankBefore);
    const depois = formatTierRank(p.rank.tierAfter, p.rank.rankAfter);
    title = `${ganhou ? "📈" : "📉"} ${riotId} ${ganhou ? "ganhou" : "perdeu"} ${Math.abs(p.rank.lpChange)} LP (Solo/Duo)`;
    description = `${antes} ${p.rank.lpBefore}LP → ${depois} ${p.rank.lpAfter}LP\n\n**Resumo da partida**\n${summaryLine(p)}`;
  } else if (p.remake) {
    title = `🎮 Nova partida — ${riotId}`;
    description = `Remake — sem alteração de LP\n\n**Resumo da partida**\n${summaryLine(p)}`;
  } else {
    title = `🎮 Nova partida — ${riotId}`;
    description = `Sem alteração de LP\n\n**Resumo da partida**\n${summaryLine(p)}`;
  }

  if (p.multikill) {
    description = `🔥 **${p.multikill}**\n\n${description}`;
  }

  if (view === "details") {
    const winratePct = p.totalTracked > 0 ? Math.round((p.winsTracked / p.totalTracked) * 100) : null;
    const winrateText =
      winratePct !== null
        ? `${winratePct}% (${p.winsTracked}V/${p.totalTracked - p.winsTracked}D em ${p.totalTracked} rastreadas)`
        : "sem dados";

    description += [
      "",
      "",
      "**Detalhes da partida**",
      `Dano recebido: ${p.totalDamageTaken.toLocaleString("pt-BR")}`,
      `Cura total: ${p.totalHeal.toLocaleString("pt-BR")}`,
      `Ouro ganho: ${p.goldEarned.toLocaleString("pt-BR")}`,
      `Visão: ${p.visionScore} (${p.wardsPlaced} colocadas, ${p.wardsKilled} destruídas)`,
      `Winrate rastreado: ${winrateText}`,
    ].join("\n");
  }

  const embed: DiscordEmbed = {
    title,
    description,
    color: p.rank ? (p.rank.lpChange >= 0 ? COLOR_WIN : COLOR_LOSS) : p.win ? COLOR_WIN : COLOR_LOSS,
    author: { name: riotId, icon_url: await championIconUrl(p.champion) },
    thumbnail: { url: await championIconUrl(p.champion) },
    timestamp: p.playedAt,
    footer: FOOTER,
  };

  const files: DiscordFile[] = [];
  const montage = await buildItemsMontage(p.items);
  if (montage) {
    const fileName = `items_${fileIndex}.png`;
    embed.description = `${embed.description}\n\n**Build**`;
    embed.image = { url: `attachment://${fileName}` };
    files.push({ name: fileName, data: montage, contentType: "image/png" });
  }

  return { embed, files: files.length > 0 ? files : undefined, buttons: buttonsForView(event.id, view) };
}

export async function buildEventEmbed(
  riotId: string,
  event: FormattableEvent,
  fileIndex = 0
): Promise<EventEmbedResult> {
  switch (event.type) {
    case "MATCH":
      return buildMatchCard(riotId, event, "summary", fileIndex);
    case "RANK_CHANGE": {
      const p = event.payload as RankChangePayload;
      const subiu = p.lpChange >= 0;
      const winratePct = p.totalTracked > 0 ? Math.round((p.winsTracked / p.totalTracked) * 100) : null;
      const lossesTracked = p.totalTracked - p.winsTracked;

      const fields = [
        { name: "Divisão", value: `${formatTierRank(p.tier, p.rank)} • ${p.lp}LP`, inline: false },
        { name: "Nessa mudança", value: `${p.lpChange >= 0 ? "+" : ""}${p.lpChange}`, inline: true },
        { name: "Saldo total", value: `${p.lpBalance >= 0 ? "+" : ""}${p.lpBalance}`, inline: true },
      ];

      if (winratePct !== null) {
        fields.push({
          name: "Winrate rastreado",
          value: `${winratePct}% (${p.winsTracked}V/${lossesTracked}D em ${p.totalTracked})`,
          inline: true,
        });
      }

      return {
        embed: {
          title: `${subiu ? "📈" : "📉"} Rank atualizado (sem partida associada) — ${riotId}`,
          color: subiu ? COLOR_WIN : COLOR_LOSS,
          fields,
          footer: FOOTER,
        },
      };
    }
    case "LIVE_GAME": {
      const p = event.payload as LiveGamePayload;
      const queueLabel = await queueDescription(p.gameQueueConfigId);
      const image = await buildLobbyImage(p.participants);
      const fileName = `lobby_${event.id}.png`;

      return {
        embed: {
          title: `🔴 ${riotId} está em partida ao vivo!`,
          description: queueLabel,
          color: COLOR_LIVE,
          image: { url: `attachment://${fileName}` },
          timestamp: new Date(p.gameStartTime).toISOString(),
          footer: FOOTER,
        },
        files: [{ name: fileName, data: image, contentType: "image/png" }],
      };
    }
  }
}

export function isMatchView(value: string): value is MatchView {
  return value === "summary" || value === "details" || value === "scoreboard";
}

export async function buildMatchView(
  riotId: string,
  event: FormattableEvent,
  view: MatchView
): Promise<EventEmbedResult> {
  return buildMatchCard(riotId, event, view, 0);
}
