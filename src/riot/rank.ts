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
