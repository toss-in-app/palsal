import { colors } from '@toss/tds-colors';
import { memo, useId } from 'react';

import { HIGH_LINE, LOW_LINE, zoneOf } from '../lib/indicators';
import { drawRange, fitRange, timeTicks, viewStart, ZOOM_PL, zoomLayout, type ChartView } from '../lib/chartView';
import { DOWN, HIGH_BG, HIGH_INK, LOW_BG, LOW_INK, MA_120, MA_200, MA_50W, UP, zoneInk } from '../lib/palette';
import type { ChartModel, ExchangeTz, Interval } from '../lib/series';
import { axisText, textWidth } from '../lib/chartText';
import { niceTicks } from '../lib/ticks';

export interface ZoomChartProps {
  model: ChartModel;
  tz: ExchangeTz;
  interval: Interval;
  view: ChartView;
  /** 값을 보여 줄 봉(세로 선) */
  point: number | null;
  width: number;
  height: number;
  /** 오른쪽 눈금 자리(px) — 밀거나 벌려도 그래프 폭이 그대로이게 받은 봉 전체로 정해요 */
  gutter: number;
}

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

/**
 * 크게 보기 차트 — 가격(종가 · 이동평균 · ▲△▼ · 엇갈림)과 RSI 를 한 그림에 그려 날짜가 위아래로 정확히 맞아요.
 * 보이는 구간(view)만 그리고, 세로 범위는 보이는 종가로 잡아요(자세히 차트와 같은 규칙).
 */
export const ZoomChart = memo(function ZoomChart({ model, tz, interval, view, point, width, height, gutter }: ZoomChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const { c, rsi } = model;
  const n = c.length;
  if (n < 2 || width <= 0 || height <= 0) return null;
  const plotW = width - ZOOM_PL - gutter;
  const right = width - gutter;
  const { priceTop, priceBottom, rsiTop, rsiBottom } = zoomLayout(height);
  const start = viewStart(view);
  const span = Math.max(1, view.count - 1);
  const x = (i: number) => ZOOM_PL + ((i - start) / span) * plotW;
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
  const y = (v: number) => priceTop + ((hi - v) / (hi - lo)) * (priceBottom - priceTop);
  const ry = (v: number) => rsiTop + ((100 - v) / 100) * (rsiBottom - rsiTop);
  const levels = niceTicks(lo, hi, 5);
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
  const lastRsi = rsi[last];
  // 최신 봉 점은 그래프 안에 있을 때만(가장자리 너머로 반쯤 밀렸으면 그리지 않아요)
  const lastShown = x(last) >= ZOOM_PL - 0.5 && x(last) <= right + 0.5;
  const p = point !== null && inView(point) ? point : null;
  const pRsi = p !== null ? rsi[p] : null;
  const priceClip = `zp${uid}`;
  const rsiClip = `zr${uid}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <clipPath id={priceClip}>
          <rect x={ZOOM_PL} y={priceTop - 8} width={plotW} height={priceBottom - priceTop + 8} />
        </clipPath>
        <clipPath id={rsiClip}>
          <rect x={ZOOM_PL} y={rsiTop - 2} width={plotW} height={rsiBottom - rsiTop + 4} />
        </clipPath>
      </defs>

      {/* 가격 칸 */}
      {levels.map((v) => (
        <g key={v}>
          <line x1={ZOOM_PL} x2={right + 4} y1={y(v)} y2={y(v)} stroke={colors.grey100} strokeWidth={1} />
          <text x={width - 2} y={y(v) + 4} fontSize={11} fill={colors.grey600} textAnchor="end">
            {axisText(v)}
          </text>
        </g>
      ))}
      {ticks.map((tk) => (
        <g key={tk.index}>
          <line x1={x(tk.index)} x2={x(tk.index)} y1={priceBottom} y2={priceBottom + 3} stroke={colors.grey300} />
          <text x={x(tk.index)} y={priceBottom + 15} fontSize={11} fill={colors.grey600} textAnchor="middle">
            {tk.text}
          </text>
        </g>
      ))}
      <g clipPath={`url(#${priceClip})`}>
        <path d={pathOf(model.ma120, i0, i1, x, y)} fill="none" stroke={MA_120} strokeWidth={1.3} strokeDasharray="4 3" opacity={0.9} />
        {model.ma200 ? <path d={pathOf(model.ma200, i0, i1, x, y)} fill="none" stroke={MA_200} strokeWidth={1.3} opacity={0.9} /> : null}
        {model.ma50w ? <path d={pathOf(model.ma50w, i0, i1, x, y)} fill="none" stroke={MA_50W} strokeWidth={1.3} opacity={0.9} /> : null}
        <path d={`${pricePath}L${x(i1).toFixed(1)},${priceBottom}L${x(i0).toFixed(1)},${priceBottom}Z`} fill={ink} fillOpacity={0.06} />
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

      {/* RSI 칸 */}
      <rect x={ZOOM_PL} y={ry(100)} width={plotW} height={ry(HIGH_LINE) - ry(100)} fill={HIGH_BG} />
      <rect x={ZOOM_PL} y={ry(LOW_LINE)} width={plotW} height={ry(0) - ry(LOW_LINE)} fill={LOW_BG} />
      {[HIGH_LINE, LOW_LINE].map((v) => (
        <g key={v}>
          <line x1={ZOOM_PL} x2={right + 4} y1={ry(v)} y2={ry(v)} stroke={colors.grey300} strokeDasharray="3 3" />
          <text x={width - 2} y={ry(v) + 4} fontSize={11} fill={colors.grey600} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <text x={width - 2} y={rsiTop + 11} fontSize={11} fontWeight={600} fill={colors.grey600} textAnchor="end">
        RSI 14
      </text>
      <g clipPath={`url(#${rsiClip})`}>
        <path d={pathOf(rsi, i0, i1, x, ry)} fill="none" stroke={colors.grey800} strokeWidth={1.5} strokeLinejoin="round" />
      </g>
      {lastShown && lastRsi !== null ? <circle cx={x(last)} cy={ry(lastRsi)} r={4} fill={zoneInk(zoneOf(lastRsi))} stroke="#fff" strokeWidth={2} /> : null}

      {/* 값 보기 세로 선 */}
      {p !== null ? (
        <g>
          <line x1={x(p)} x2={x(p)} y1={priceTop - 4} y2={rsiBottom} stroke={colors.grey500} strokeWidth={1} />
          <circle cx={x(p)} cy={y(c[p])} r={4.5} fill="#fff" stroke={ink} strokeWidth={2} />
          {pRsi !== null ? <circle cx={x(p)} cy={ry(pRsi)} r={4} fill="#fff" stroke={zoneInk(zoneOf(pRsi))} strokeWidth={2} /> : null}
        </g>
      ) : null}
    </svg>
  );
});
