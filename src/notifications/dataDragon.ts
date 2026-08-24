import { Jimp, loadFont } from "jimp";
import { SANS_16_WHITE } from "jimp/fonts";

let cachedVersion: string | null = null;

async function getLatestVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;

  try {
    const response = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
    const versions = (await response.json()) as string[];
    cachedVersion = versions[0];
  } catch {
    cachedVersion = "14.1.1"; // fallback caso o Data Dragon esteja fora do ar
  }

  return cachedVersion;
}

/** championName vem do Match-V5 já no formato usado pelas URLs do Data Dragon (ex: "MonkeyKing", "Nunu", "LeeSin"). */
export async function championIconUrl(championName: string): Promise<string> {
  const version = await getLatestVersion();
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;
}

const ICON_SIZE = 36;
const ICON_GAP = 2;
const BACKGROUND_COLOR = 0x2f3136ff; // cinza escuro do Discord

const itemIconBufferCache = new Map<number, Buffer>();

async function getItemIconBuffer(itemId: number, version: string): Promise<Buffer> {
  const cached = itemIconBufferCache.get(itemId);
  if (cached) return cached;

  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`);
  const buffer = Buffer.from(await response.arrayBuffer());
  itemIconBufferCache.set(itemId, buffer);
  return buffer;
}

/** Monta uma faixa horizontal com os ícones dos itens (0 = slot vazio, ignorado). Retorna null se não tiver nenhum item. */
export async function buildItemsMontage(itemIds: number[]): Promise<Buffer | null> {
  const realItems = itemIds.filter((id) => id !== 0);
  if (realItems.length === 0) return null;

  const version = await getLatestVersion();

  const icons = await Promise.all(
    realItems.map(async (id) => {
      const buffer = await getItemIconBuffer(id, version);
      const icon = await Jimp.read(buffer);
      icon.resize({ w: ICON_SIZE, h: ICON_SIZE });
      return icon;
    })
  );

  const width = realItems.length * ICON_SIZE + (realItems.length - 1) * ICON_GAP;
  const canvas = new Jimp({ width, height: ICON_SIZE, color: BACKGROUND_COLOR });

  icons.forEach((icon, index) => {
    canvas.composite(icon, index * (ICON_SIZE + ICON_GAP), 0);
  });

  return canvas.getBuffer("image/png");
}

export interface ScoreboardParticipant {
  name: string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  teamId: number; // 100 = azul, 200 = vermelho
  win: boolean;
  items: number[];
  isTracked: boolean;
}

const championIconBufferCache = new Map<string, Buffer>();

async function getChampionIconBuffer(championName: string, version: string): Promise<Buffer> {
  const cached = championIconBufferCache.get(championName);
  if (cached) return cached;

  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`);
  const buffer = Buffer.from(await response.arrayBuffer());
  championIconBufferCache.set(championName, buffer);
  return buffer;
}

const SB_CHAMPION_ICON_SIZE = 22;
const SB_ITEM_ICON_SIZE = 15;
const SB_ROW_HEIGHT = 28;
const SB_HEADER_HEIGHT = 22;
const SB_COLUMN_WIDTH = 300;
const SB_COLUMN_GAP = 14;
const SB_BG = 0x2f3136ff;
const SB_ROW_HIGHLIGHT = 0x40444bff;
const SB_BLUE_HEADER = 0x1f3a5fff;
const SB_RED_HEADER = 0x5f2020ff;

/** Monta a imagem do placar completo (10 players, 2 times, itens e KDA de cada um). */
export async function buildScoreboardImage(participants: ScoreboardParticipant[]): Promise<Buffer> {
  const version = await getLatestVersion();
  const font = await loadFont(SANS_16_WHITE);

  const blue = participants.filter((p) => p.teamId === 100);
  const red = participants.filter((p) => p.teamId === 200);
  const rows = Math.max(blue.length, red.length);

  const width = SB_COLUMN_WIDTH * 2 + SB_COLUMN_GAP;
  const height = SB_HEADER_HEIGHT + SB_ROW_HEIGHT * rows;

  const canvas = new Jimp({ width, height, color: SB_BG });

  const blueWon = blue[0]?.win ?? true;
  canvas.composite(new Jimp({ width: SB_COLUMN_WIDTH, height: SB_HEADER_HEIGHT, color: SB_BLUE_HEADER }), 0, 0);
  canvas.composite(
    new Jimp({ width: SB_COLUMN_WIDTH, height: SB_HEADER_HEIGHT, color: SB_RED_HEADER }),
    SB_COLUMN_WIDTH + SB_COLUMN_GAP,
    0
  );
  canvas.print({
    font,
    x: 8,
    y: 3,
    text: `Time Azul — ${blueWon ? "Vitória" : "Derrota"}`,
    maxWidth: SB_COLUMN_WIDTH - 16,
  });
  canvas.print({
    font,
    x: SB_COLUMN_WIDTH + SB_COLUMN_GAP + 8,
    y: 3,
    text: `Time Vermelho — ${!blueWon ? "Vitória" : "Derrota"}`,
    maxWidth: SB_COLUMN_WIDTH - 16,
  });

  const renderRow = async (
    participant: ScoreboardParticipant | undefined,
    xOffset: number,
    y: number
  ): Promise<void> => {
    if (!participant) return;

    if (participant.isTracked) {
      canvas.composite(
        new Jimp({ width: SB_COLUMN_WIDTH, height: SB_ROW_HEIGHT, color: SB_ROW_HIGHLIGHT }),
        xOffset,
        y
      );
    }

    const champBuffer = await getChampionIconBuffer(participant.champion, version);
    const champIcon = await Jimp.read(champBuffer);
    champIcon.resize({ w: SB_CHAMPION_ICON_SIZE, h: SB_CHAMPION_ICON_SIZE });
    canvas.composite(champIcon, xOffset + 2, y + Math.floor((SB_ROW_HEIGHT - SB_CHAMPION_ICON_SIZE) / 2));

    const textX = xOffset + SB_CHAMPION_ICON_SIZE + 6;
    const name = participant.name.length > 8 ? `${participant.name.slice(0, 7)}…` : participant.name;
    canvas.print({ font, x: textX, y: y + 6, text: name, maxWidth: 72 });

    const kdaText = `${participant.kills}/${participant.deaths}/${participant.assists}`;
    canvas.print({ font, x: textX + 76, y: y + 6, text: kdaText, maxWidth: 56 });

    let itemX = textX + 76 + 60;
    for (const itemId of participant.items) {
      if (itemId === 0) continue;
      const itemBuffer = await getItemIconBuffer(itemId, version);
      const itemIcon = await Jimp.read(itemBuffer);
      itemIcon.resize({ w: SB_ITEM_ICON_SIZE, h: SB_ITEM_ICON_SIZE });
      canvas.composite(itemIcon, itemX, y + Math.floor((SB_ROW_HEIGHT - SB_ITEM_ICON_SIZE) / 2));
      itemX += SB_ITEM_ICON_SIZE + 1;
    }
  };

  for (let i = 0; i < rows; i++) {
    const y = SB_HEADER_HEIGHT + i * SB_ROW_HEIGHT;
    await renderRow(blue[i], 0, y);
    await renderRow(red[i], SB_COLUMN_WIDTH + SB_COLUMN_GAP, y);
  }

  return canvas.getBuffer("image/png");
}

let cachedChampionById: Map<number, { id: string; name: string }> | null = null;

/** Spectator-V5 só dá o championId numérico — precisa do champion.json do Data Dragon pra achar ícone/nome. */
async function getChampionById(): Promise<Map<number, { id: string; name: string }>> {
  if (cachedChampionById) return cachedChampionById;

  const version = await getLatestVersion();
  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/champion.json`);
  const data = (await response.json()) as { data: Record<string, { key: string; id: string; name: string }> };

  const map = new Map<number, { id: string; name: string }>();
  for (const champ of Object.values(data.data)) {
    map.set(Number(champ.key), { id: champ.id, name: champ.name });
  }

  cachedChampionById = map;
  return map;
}

let cachedQueueNames: Record<number, string> | null = null;

async function getQueueNames(): Promise<Record<number, string>> {
  if (cachedQueueNames) return cachedQueueNames;

  try {
    const response = await fetch("https://static.developer.riotgames.com/docs/lol/queues.json");
    const queues = (await response.json()) as { queueId: number; description: string | null }[];
    cachedQueueNames = {};
    for (const q of queues) {
      cachedQueueNames[q.queueId] = q.description ?? `Fila ${q.queueId}`;
    }
  } catch {
    cachedQueueNames = {};
  }

  return cachedQueueNames;
}

export async function queueDescription(queueId: number): Promise<string> {
  const names = await getQueueNames();
  return names[queueId] ?? `Fila ${queueId}`;
}

export interface LobbyParticipant {
  name: string;
  championId: number;
  teamId: number;
  isTracked: boolean;
}

const LB_CHAMPION_ICON_SIZE = 24;
const LB_ROW_HEIGHT = 30;
const LB_HEADER_HEIGHT = 22;
const LB_COLUMN_WIDTH = 240;
const LB_COLUMN_GAP = 14;
const LB_BG = 0x2f3136ff;
const LB_ROW_HIGHLIGHT = 0x40444bff;
const LB_BLUE_HEADER = 0x1f3a5fff;
const LB_RED_HEADER = 0x5f2020ff;

/** Monta a imagem do lobby (10 players, times, campeões escolhidos) pra partida ainda em andamento. */
export async function buildLobbyImage(participants: LobbyParticipant[]): Promise<Buffer> {
  const version = await getLatestVersion();
  const font = await loadFont(SANS_16_WHITE);
  const champions = await getChampionById();

  const blue = participants.filter((p) => p.teamId === 100);
  const red = participants.filter((p) => p.teamId === 200);
  const rows = Math.max(blue.length, red.length);

  const width = LB_COLUMN_WIDTH * 2 + LB_COLUMN_GAP;
  const height = LB_HEADER_HEIGHT + LB_ROW_HEIGHT * rows;

  const canvas = new Jimp({ width, height, color: LB_BG });

  canvas.composite(new Jimp({ width: LB_COLUMN_WIDTH, height: LB_HEADER_HEIGHT, color: LB_BLUE_HEADER }), 0, 0);
  canvas.composite(
    new Jimp({ width: LB_COLUMN_WIDTH, height: LB_HEADER_HEIGHT, color: LB_RED_HEADER }),
    LB_COLUMN_WIDTH + LB_COLUMN_GAP,
    0
  );
  canvas.print({ font, x: 8, y: 3, text: "Time Azul", maxWidth: LB_COLUMN_WIDTH - 16 });
  canvas.print({ font, x: LB_COLUMN_WIDTH + LB_COLUMN_GAP + 8, y: 3, text: "Time Vermelho", maxWidth: LB_COLUMN_WIDTH - 16 });

  const renderRow = async (participant: LobbyParticipant | undefined, xOffset: number, y: number): Promise<void> => {
    if (!participant) return;

    if (participant.isTracked) {
      canvas.composite(
        new Jimp({ width: LB_COLUMN_WIDTH, height: LB_ROW_HEIGHT, color: LB_ROW_HIGHLIGHT }),
        xOffset,
        y
      );
    }

    const champ = champions.get(participant.championId);
    const champBuffer = await getChampionIconBuffer(champ?.id ?? "Aatrox", version);
    const champIcon = await Jimp.read(champBuffer);
    champIcon.resize({ w: LB_CHAMPION_ICON_SIZE, h: LB_CHAMPION_ICON_SIZE });
    canvas.composite(champIcon, xOffset + 2, y + Math.floor((LB_ROW_HEIGHT - LB_CHAMPION_ICON_SIZE) / 2));

    const textX = xOffset + LB_CHAMPION_ICON_SIZE + 6;
    const name = participant.name.length > 12 ? `${participant.name.slice(0, 11)}…` : participant.name;
    const label = `${name} — ${champ?.name ?? "?"}`;
    canvas.print({ font, x: textX, y: y + 7, text: label, maxWidth: LB_COLUMN_WIDTH - (textX - xOffset) - 8 });
  };

  for (let i = 0; i < rows; i++) {
    const y = LB_HEADER_HEIGHT + i * LB_ROW_HEIGHT;
    await renderRow(blue[i], 0, y);
    await renderRow(red[i], LB_COLUMN_WIDTH + LB_COLUMN_GAP, y);
  }

  return canvas.getBuffer("image/png");
}
