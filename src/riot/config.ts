type RegionalRouting = "americas" | "europe" | "asia" | "sea";

const PLATFORM_TO_REGION: Record<string, RegionalRouting> = {
  na1: "americas",
  br1: "americas",
  la1: "americas",
  la2: "americas",
  oc1: "americas",
  euw1: "europe",
  eun1: "europe",
  tr1: "europe",
  ru: "europe",
  kr: "asia",
  jp1: "asia",
  ph2: "sea",
  sg2: "sea",
  th2: "sea",
  tw2: "sea",
  vn2: "sea",
};

export const PLATFORM = (process.env.RIOT_PLATFORM ?? "br1").toLowerCase();

const region = PLATFORM_TO_REGION[PLATFORM];
if (!region) {
  throw new Error(
    `RIOT_PLATFORM "${PLATFORM}" desconhecida. Valores aceitos: ${Object.keys(PLATFORM_TO_REGION).join(", ")}`
  );
}

export const REGION: RegionalRouting = region;

export function platformUrl(path: string): string {
  return `https://${PLATFORM}.api.riotgames.com${path}`;
}

export function regionalUrl(path: string): string {
  return `https://${REGION}.api.riotgames.com${path}`;
}
