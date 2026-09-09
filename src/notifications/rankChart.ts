import { Resvg } from "@resvg/resvg-js";
import { tierShortCode, valueToShortCode } from "../riot/rank";
import { Granularity, GRANULARITY_PT, PlayerHistory } from "../jobs/rankHistory";

const W = 920;
const H = 360;
const PAD_LEFT = 58;
const PAD_RIGHT = 22;
const PAD_BOTTOM = 34;

const BG = "#2f3136";
const PLOT_BG = "#26282c";
const GRID = "#3a3d43";
const AXIS_TEXT = "#8e9297";
const LABEL_TEXT = "#dcddde";

const PALETTE = ["#5cd85c", "#5aa9e6", "#e6a23c", "#e05c5c", "#b57edc", "#4dd0c1"];

// Passo mínimo de 100 = uma divisão (rankToValue anda de 100 em 100 por divisão),
// pra não gerar dois rótulos "E 3" na mesma faixa.
const GRID_STEPS = [100, 200, 400, 800, 1600];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function niceStep(span: number): number {
  const target = span / 5;
  return GRID_STEPS.find((s) => s >= target) ?? GRID_STEPS[GRID_STEPS.length - 1];
}

function placeholder(message: string): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <text x="${W / 2}" y="${H / 2}" fill="${AXIS_TEXT}" font-family="sans-serif" font-size="16"
      text-anchor="middle">${esc(message)}</text>
  </svg>`;
  return renderSvg(svg);
}

function renderSvg(svg: string): Buffer {
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: W * 2 },
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng();
  return Buffer.from(png);
}

/**
 * Renderiza o gráfico de rank ao longo do tempo (uma linha por player) num PNG.
 * Eixo x categórico (períodos igualmente espaçados), eixo y = rankToValue.
 */
export function renderRankHistoryPng(histories: PlayerHistory[], granularity: Granularity): Buffer {
  const series = histories.filter((h) => h.points.length > 0);
  if (series.length === 0) {
    return placeholder("Ainda não tem histórico de rank suficiente pra montar o gráfico.");
  }

  const isMulti = series.length > 1;
  const legendH = isMulti ? 34 : 6;
  const padTop = 18 + legendH;
  const plotW = W - PAD_LEFT - PAD_RIGHT;
  const plotH = H - padTop - PAD_BOTTOM;

  // Eixo x: união ordenada dos períodos presentes em qualquer série.
  const periodTimes = [
    ...new Set(series.flatMap((h) => h.points.map((p) => p.periodStart.getTime()))),
  ].sort((a, b) => a - b);
  const idxByTime = new Map(periodTimes.map((t, i) => [t, i]));
  const n = periodTimes.length;
  const labelByTime = new Map<number, string>();
  for (const h of series) {
    for (const p of h.points) labelByTime.set(p.periodStart.getTime(), p.label);
  }

  const xAt = (time: number): number => {
    const i = idxByTime.get(time) ?? 0;
    return n === 1 ? PAD_LEFT + plotW / 2 : PAD_LEFT + (plotW * i) / (n - 1);
  };

  // Eixo y.
  const values = series.flatMap((h) => h.points.map((p) => p.value));
  let domMin = Math.min(...values);
  let domMax = Math.max(...values);
  if (domMin === domMax) {
    domMin -= 120;
    domMax += 120;
  } else {
    const pad = (domMax - domMin) * 0.14;
    domMin -= pad;
    domMax += pad;
  }
  domMin = Math.max(0, domMin);
  const yAt = (v: number): number => padTop + plotH * (1 - (v - domMin) / (domMax - domMin));

  const step = niceStep(domMax - domMin);
  const gridValues: number[] = [];
  for (let v = Math.ceil(domMin / step) * step; v <= domMax; v += step) gridValues.push(v);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif">`
  );
  parts.push(`<rect width="${W}" height="${H}" fill="${BG}"/>`);
  parts.push(
    `<rect x="${PAD_LEFT}" y="${padTop}" width="${plotW}" height="${plotH}" fill="${PLOT_BG}" rx="4"/>`
  );

  // Grade horizontal + rótulos de elo.
  for (const v of gridValues) {
    const y = yAt(v);
    parts.push(
      `<line x1="${PAD_LEFT}" y1="${y.toFixed(1)}" x2="${PAD_LEFT + plotW}" y2="${y.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    );
    parts.push(
      `<text x="${PAD_LEFT - 8}" y="${(y + 4).toFixed(1)}" fill="${AXIS_TEXT}" font-size="11" text-anchor="end">${esc(valueToShortCode(v))}</text>`
    );
  }

  // Rótulos do eixo x.
  const everyOther = n > 12;
  periodTimes.forEach((t, i) => {
    if (everyOther && i % 2 === 1) return;
    parts.push(
      `<text x="${xAt(t).toFixed(1)}" y="${H - PAD_BOTTOM + 16}" fill="${AXIS_TEXT}" font-size="11" text-anchor="middle">${esc(labelByTime.get(t) ?? "")}</text>`
    );
  });

  // Rótulo do modo, canto superior direito (não conflita com a legenda multi, que fica à esquerda).
  parts.push(
    `<text x="${W - PAD_RIGHT}" y="14" fill="${AXIS_TEXT}" font-size="10" text-anchor="end">${esc(GRANULARITY_PT[granularity])}</text>`
  );

  // Séries.
  series.forEach((h, si) => {
    const color = isMulti ? PALETTE[si % PALETTE.length] : PALETTE[0];
    const pts = h.points
      .map((p) => `${xAt(p.periodStart.getTime()).toFixed(1)},${yAt(p.value).toFixed(1)}`)
      .join(" ");
    if (h.points.length > 1) {
      parts.push(
        `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
      );
    }
    h.points.forEach((p, pi) => {
      const x = xAt(p.periodStart.getTime());
      const y = yAt(p.value);
      parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${color}"/>`);

      if (!isMulti) {
        const anchor = pi === 0 ? "start" : pi === h.points.length - 1 ? "end" : "middle";
        const tx = pi === 0 ? x + 2 : pi === h.points.length - 1 ? x - 2 : x;
        // Perto do topo do gráfico, joga os rótulos pra baixo do ponto pra não cortar.
        const below = y < padTop + 34;
        const y1 = below ? y + 16 : y - 20;
        const y2 = below ? y + 28 : y - 8;
        parts.push(
          `<text x="${tx.toFixed(1)}" y="${y1.toFixed(1)}" fill="${LABEL_TEXT}" font-size="11" font-weight="600" text-anchor="${anchor}">${esc(tierShortCode(p.tier, p.rank))}</text>`
        );
        parts.push(
          `<text x="${tx.toFixed(1)}" y="${y2.toFixed(1)}" fill="${AXIS_TEXT}" font-size="10" text-anchor="${anchor}">${p.lp}LP</text>`
        );
      }
    });
  });

  // Legenda (multi-player).
  if (isMulti) {
    let lx = PAD_LEFT;
    let ly = 20;
    for (let si = 0; si < series.length; si++) {
      const h = series[si];
      const color = PALETTE[si % PALETTE.length];
      const cur = h.current;
      const text = cur
        ? `${h.riotId} · ${tierShortCode(cur.tier, cur.rank)} ${cur.lp}LP`
        : h.riotId;
      const width = 18 + text.length * 6.6;
      if (lx + width > W - PAD_RIGHT && lx > PAD_LEFT) {
        lx = PAD_LEFT;
        ly += 16;
      }
      parts.push(`<rect x="${lx}" y="${ly - 9}" width="10" height="10" rx="2" fill="${color}"/>`);
      parts.push(
        `<text x="${lx + 15}" y="${ly}" fill="${LABEL_TEXT}" font-size="11">${esc(text)}</text>`
      );
      lx += width + 8;
    }
  }

  parts.push(`</svg>`);
  return renderSvg(parts.join(""));
}
