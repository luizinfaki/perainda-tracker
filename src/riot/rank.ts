const TIER_ORDER = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];

const DIVISION_ORDER: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 };

const MASTER_INDEX = TIER_ORDER.indexOf("MASTER");

/** Nome do tier em pt-BR. Usado nas mensagens e na legenda dos gráficos. */
export const TIER_LABELS: Record<string, string> = {
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

export const DIVISION_LABELS: Record<string, string> = { IV: "4", III: "3", II: "2", I: "1" };

export const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

/** Sigla curta pro tier, pra caber em label de gráfico. */
const TIER_SHORT: Record<string, string> = {
  IRON: "F",
  BRONZE: "B",
  SILVER: "P",
  GOLD: "O",
  PLATINUM: "PL",
  EMERALD: "E",
  DIAMOND: "D",
  MASTER: "M",
  GRANDMASTER: "GM",
  CHALLENGER: "CHAL",
};

/**
 * Converte tier+rank+lp num valor numérico comparável, pra calcular ganho/perda de LP
 * mesmo quando o player troca de divisão/tier (ex: OURO IV 90LP -> OURO III 0LP é ganho, não perda de 90LP).
 * Master/Grandmaster/Challenger não têm divisão, então tratamos como uma escala contínua a partir de Master.
 */
export function rankToValue(tier: string, rank: string, lp: number): number {
  const tierIndex = TIER_ORDER.indexOf(tier.toUpperCase());
  if (tierIndex === -1) return lp;

  if (tierIndex >= MASTER_INDEX) {
    return MASTER_INDEX * 400 + lp;
  }

  const divisionIndex = DIVISION_ORDER[rank.toUpperCase()] ?? 0;
  return tierIndex * 400 + divisionIndex * 100 + lp;
}

/** Ex: "EMERALD"+"III" -> "Esmeralda 3". Tiers sem divisão (Mestre+) não mostram número. */
export function formatTierRank(tier: string, rank: string): string {
  const tierLabel = TIER_LABELS[tier.toUpperCase()] ?? tier;
  if (APEX_TIERS.has(tier.toUpperCase())) return tierLabel;
  const divisionLabel = DIVISION_LABELS[rank.toUpperCase()] ?? rank;
  return `${tierLabel} ${divisionLabel}`;
}

/** Ex: "EMERALD"+"IV" -> "E 4"; "MASTER" -> "M". Formato compacto pros rótulos do gráfico. */
export function tierShortCode(tier: string, rank: string): string {
  const upperTier = tier.toUpperCase();
  const short = TIER_SHORT[upperTier] ?? upperTier.slice(0, 2);
  if (APEX_TIERS.has(upperTier)) return short;
  const divisionLabel = DIVISION_LABELS[rank.toUpperCase()] ?? rank;
  return `${short} ${divisionLabel}`;
}

const DIVISION_BY_INDEX = ["IV", "III", "II", "I"];

/**
 * Inverso aproximado de rankToValue — dado um valor numérico, devolve a sigla da divisão
 * (ex: 2100 -> "E 3"). Usado só pros rótulos de grade do gráfico. Acima de Mestre não dá
 * pra distinguir M/GM/CHAL só pelo valor, então cai em "M".
 */
export function valueToShortCode(value: number): string {
  const clamped = Math.max(0, value);
  const tierIndex = Math.min(MASTER_INDEX, Math.floor(clamped / 400));
  const tier = TIER_ORDER[tierIndex];
  const short = TIER_SHORT[tier] ?? tier.slice(0, 2);
  if (tierIndex >= MASTER_INDEX) return short;
  const divisionIndex = Math.min(3, Math.floor((clamped % 400) / 100));
  return `${short} ${DIVISION_LABELS[DIVISION_BY_INDEX[divisionIndex]]}`;
}
