import { colors } from '@toss/tds-colors';
import { memo, useId } from 'react';

import { axisText, textWidth } from '../lib/chartText';
import { drawRange, fitRange, timeTicks, viewStart, ZOOM_PL, type ChartView } from '../lib/chartView';
import { HIGH_LINE, LOW_LINE, zoneOf } from '../lib/indicators';
import { DOWN, HIGH_BG, HIGH_INK, LOW_BG, LOW_INK, MA_120, MA_200, MA_50W, UP, zoneInk } from '../lib/palette';
import type { ChartModel, ExchangeTz, Interval } from '../lib/series';
import { niceTicks } from '../lib/ticks';

/*
 * 종목 자세히의 움직이는 차트 — 가격 칸과 RSI 칸을 따로 그리되 같은 보이는 구간(view) · 같은 오른쪽 눈금 폭(gutter)을 써서
 * 날짜가 위아래로 정확히 맞아요. 보이는 봉만 그리고, 가격 칸 세로 범위는 보이는 종가로 잡아요(자세히 차트 규칙 그대로).
 */

export interface PanelProps {
  model: ChartModel;
  view: ChartView;
  /** 값을 보여 줄 봉(세로 선) */
  point: number | null;
  width: number;
  height: number;
  /** 오른쪽 눈금 자리(px) — 밀거나 벌려도 그래프 폭이 그대로이게 받은 봉 전체로 정해요 */
  gutter: number;
}

/** 날짜 글자 줄 높이(가격 칸 아래) */
export const DATE_H = 22;

function pathOf(values: readonly (number | null)[], i0: number, i1: number, x: (i: number) => number, y: (v: number) => number): string {
  let d = '';
  let open = false;
  for (let i = i0; i <= i1; i++) {
    const v = values[i];
    if (v === null || v === undefined) {
      open = false;
      continue;
    }
    d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    open = true;
  }
  return d;
}

function xOf(view: ChartView, width: number, gutter: number) {
  const plotW = width - ZOOM_PL - gutter;
  const start = viewStart(view);
  const span = Math.max(1, view.count - 1);
  return { plotW, right: width - gutter, x: (i: number) => ZOOM_PL + ((i - start) / span) * plotW };
}

/** 가격 칸: 종가 · 이동평균 · ▲△▼ · 엇갈림 · 아래 날짜 눈금 */
export const PricePanel = memo(function PricePanel({ model, view, point, width, height, gutter, tz, interval }: PanelProps & { tz: ExchangeTz; interval: Interval }) {
  const clip = `pp${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { c } = model;
  const n = c.length;
  if (n < 2 || width <= 0) return null;
  const { plotW, right, x } = xOf(view, width, gutter);
  const top = 10;
  const bottom = height - DATE_H;
  const [i0, i1] = drawRange(view, n);
  const [f0, f1] = fitRange(view, n);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = f0; i <= f1; i++) {
    lo = Math.min(lo, c[i]);
    hi = Math.max(hi, c[i]);
  }
  const pad = (hi - lo || hi * 0.02 || 1) * 0.1;
  lo -= pad;
  hi += pad * 1.4;
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * (bottom - top);
  const ink = c[f1] >= c[f0] ? UP : DOWN;
  const pricePath = pathOf(c, i0, i1, x, y);
  const div = model.divergence;
  const divInk = div?.type === 'bull' ? LOW_INK : HIGH_INK;
  const inView = (i: number) => i >= i0 && i <= i1;
  // 날짜 글자가 그림 가장자리에서 잘리면 빼요('2022년' 이 '022년' 으로 보이지 않게)
  const ticks = timeTicks(model.t, tz, interval, view, plotW).filter((tk) => {
    const half = textWidth(tk.text) / 2 + 1;
    return x(tk.index) - half >= 0 && x(tk.index) + half <= width - 2;
  });
  const last = n - 1;
  // 최신 봉 점은 그래프 안에 있을 때만(가장자리 너머로 반쯤 밀렸으면 그리지 않아요)
  const lastShown = x(last) >= ZOOM_PL - 0.5 && x(last) <= right + 0.5;
  const p = point !== null && inView(point) ? point : null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <clipPath id={clip}>
          <rect x={ZOOM_PL} y={top - 8} width={plotW} height={bottom - top + 8} />
        </clipPath>
      </defs>
      {niceTicks(lo, hi, 4).map((v) => (
        <g key={v}>
          <line x1={ZOOM_PL} x2={right + 4} y1={y(v)} y2={y(v)} stroke={colors.grey100} strokeWidth={1} />
          <text x={width - 2} y={y(v) + 4} fontSize={11} fill={colors.grey600} textAnchor="end">
            {axisText(v)}
          </text>
        </g>
      ))}
      {ticks.map((tk) => (
        <g key={tk.index}>
          <line x1={x(tk.index)} x2={x(tk.index)} y1={bottom} y2={bottom + 3} stroke={colors.grey300} />
          <text x={x(tk.index)} y={bottom + 15} fontSize={11} fill={colors.grey600} textAnchor="middle">
            {tk.text}
          </text>
        </g>
      ))}
      <g clipPath={`url(#${clip})`}>
        <path d={pathOf(model.ma120, i0, i1, x, y)} fill="none" stroke={MA_120} strokeWidth={1.3} strokeDasharray="4 3" opacity={0.9} />
        {model.ma200 ? <path d={pathOf(model.ma200, i0, i1, x, y)} fill="none" stroke={MA_200} strokeWidth={1.3} opacity={0.9} /> : null}
        {model.ma50w ? <path d={pathOf(model.ma50w, i0, i1, x, y)} fill="none" stroke={MA_50W} strokeWidth={1.3} opacity={0.9} /> : null}
        <path d={`${pricePath}L${x(i1).toFixed(1)},${bottom}L${x(i0).toFixed(1)},${bottom}Z`} fill={ink} fillOpacity={0.06} />
        <path d={pricePath} fill="none" stroke={ink} strokeWidth={1.8} strokeLinejoin="round" />
        {div && div.to >= i0 && div.from <= i1 ? (
          <g>
            <line x1={x(div.from)} y1={y(c[div.from])} x2={x(div.to)} y2={y(c[div.to])} stroke={divInk} strokeWidth={1.6} strokeDasharray="3 2.5" />
            {[div.from, div.to].map((i) => (
              <circle key={i} cx={x(i)} cy={y(c[i])} r={3} fill="#fff" stroke={divInk} strokeWidth={1.6} />
            ))}
          </g>
        ) : null}
        {model.lowMarks
          .filter((m) => inView(m.index))
          .map((m) => {
            const px = x(m.index);
            const py = y(c[m.index]) + 7;
            return (
              <path
                key={`l${m.index}`}
                d={`M${px.toFixed(1)},${py.toFixed(1)}l4.6,8h-9.2z`}
                fill={m.closed ? LOW_INK : '#fff'}
                stroke={m.closed ? '#fff' : LOW_INK}
                strokeWidth={m.closed ? 1 : 1.4}
              />
            );
          })}
        {model.peakMarks
          .filter((m) => inView(m.index))
          .map((m) => {
            const px = x(m.index);
            const py = y(c[m.index]) - 7;
            return <path key={`p${m.index}`} d={`M${px.toFixed(1)},${py.toFixed(1)}l4.6,-8h-9.2z`} fill={HIGH_INK} stroke="#fff" strokeWidth={1} />;
          })}
      </g>
      {lastShown ? <circle cx={x(last)} cy={y(c[last])} r={4} fill={ink} stroke="#fff" strokeWidth={2} /> : null}
      {p !== null ? (
        <g>
          <line x1={x(p)} x2={x(p)} y1={top - 4} y2={bottom} stroke={colors.grey500} strokeWidth={1} />
          <circle cx={x(p)} cy={y(c[p])} r={4.5} fill="#fff" stroke={ink} strokeWidth={2} />
        </g>
      ) : null}
    </svg>
  );
});

/** RSI 칸: 0~100, 30 아래 · 70 위를 옅게 칠하고 선을 그어요 */
export const RsiPanel = memo(function RsiPanel({ model, view, point, width, height, gutter }: PanelProps) {
  const clip = `rp${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { rsi } = model;
  const n = rsi.length;
  if (n < 2 || width <= 0) return null;
  const { plotW, right, x } = xOf(view, width, gutter);
  const top = 6;
  const bottom = height - 6;
  const y = (v: number) => top + ((100 - v) / 100) * (bottom - top);
  const [i0, i1] = drawRange(view, n);
  const last = n - 1;
  const lastRsi = rsi[last];
  const lastShown = lastRsi !== null && x(last) >= ZOOM_PL - 0.5 && x(last) <= right + 0.5;
  const p = point !== null && point >= i0 && point <= i1 ? point : null;
  const pRsi = p !== null ? rsi[p] : null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <clipPath id={clip}>
          <rect x={ZOOM_PL} y={top - 2} width={plotW} height={bottom - top + 4} />
        </clipPath>
      </defs>
      <rect x={ZOOM_PL} y={y(100)} width={plotW} height={y(HIGH_LINE) - y(100)} fill={HIGH_BG} />
      <rect x={ZOOM_PL} y={y(LOW_LINE)} width={plotW} height={y(0) - y(LOW_LINE)} fill={LOW_BG} />
      {[HIGH_LINE, LOW_LINE].map((v) => (
        <g key={v}>
          <line x1={ZOOM_PL} x2={right + 4} y1={y(v)} y2={y(v)} stroke={colors.grey300} strokeDasharray="3 3" />
          <text x={width - 2} y={y(v) + 4} fontSize={11} fill={colors.grey600} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <g clipPath={`url(#${clip})`}>
        <path d={pathOf(rsi, i0, i1, x, y)} fill="none" stroke={colors.grey800} strokeWidth={1.5} strokeLinejoin="round" />
      </g>
      {lastShown ? <circle cx={x(last)} cy={y(lastRsi)} r={4} fill={zoneInk(zoneOf(lastRsi))} stroke="#fff" strokeWidth={2} /> : null}
      {p !== null ? (
        <g>
          <line x1={x(p)} x2={x(p)} y1={top} y2={bottom} stroke={colors.grey500} strokeWidth={1} />
          {pRsi !== null ? <circle cx={x(p)} cy={y(pRsi)} r={4} fill="#fff" stroke={zoneInk(zoneOf(pRsi))} strokeWidth={2} /> : null}
        </g>
      ) : null}
    </svg>
  );
});
