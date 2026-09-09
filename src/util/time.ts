export const SAO_PAULO_TZ = "America/Sao_Paulo";

/** Ano/mês/dia no fuso de São Paulo pra um instante qualquer. */
export function saoPauloYmd(d: Date): [number, number, number] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [y, m, day] = parts.split("-").map(Number);
  return [y, m, day];
}

/** Diferença entre horário local no fuso e UTC pro instante d (São Paulo = -3h, sem horário de verão). */
export function tzOffsetMs(d: Date): number {
  const local = new Date(d.toLocaleString("en-US", { timeZone: SAO_PAULO_TZ }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return local.getTime() - utc.getTime();
}

/** Instante correspondente à meia-noite local (fuso SP) de uma data-calendário. */
export function saoPauloMidnight(y: number, m: number, day: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, day));
  return new Date(guess.getTime() - tzOffsetMs(guess));
}

export interface SaoPauloParts {
  y: number;
  m: number;
  day: number;
  hour: number; // 0–23
  weekday: number; // 0 = segunda ... 6 = domingo
}

/** Decompõe um instante nas partes de data/hora no fuso de São Paulo. */
export function saoPauloParts(d: Date): SaoPauloParts {
  const [y, m, day] = saoPauloYmd(d);

  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: SAO_PAULO_TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(d);
  const hour = Number(hourStr.slice(0, 2));

  // getUTCDay do instante da meia-noite local: 0=domingo -> converte pra 0=segunda
  const weekday = (saoPauloMidnight(y, m, day).getUTCDay() + 6) % 7;

  return { y, m, day, hour, weekday };
}
