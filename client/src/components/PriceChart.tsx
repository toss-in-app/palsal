import { colors } from '@toss/tds-colors';
import { memo, useId } from 'react';

import { axisLabels, textWidth } from '../lib/chartText';
import { exchangeDay, type ChartModel, type ExchangeTz, type Interval } from '../lib/series';
import { DOWN, HIGH_INK, LOW_INK, MA_120, MA_200, MA_50W, UP } from '../lib/palette';
import { niceTicks } from '../lib/ticks';

export interface PriceChartProps {
  model: ChartModel;
  tz: ExchangeTz;
  interval: Interval;
  /** 화면 읽기 프로그램용 설명 */
  label: string;
  width?: number;
  height?: number;
}

const PL = 2;
const PT = 12;
const PB = 22;

/** 연속된 값만 이어서 선 하나씩(앞부분 null 은 건너뛰어요) */
function linePath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = '';
  let open = false;
  values.forEach((v, i) => {
    if (v === null) {
      open = false;
      return;
    }
    d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    open = true;
  });
  return d;
}

interface Tick {
  x: number;
  text: string;
}

function ticks(t: number[], tz: ExchangeTz, interval: Interval, x: (i: number) => number): Tick[] {
  const out: Tick[] = [];
  let prevKey = '';
  for (let i = 0; i < t.length; i++) {
    const day = exchangeDay(t[i] * 1000, tz);
    const y = Number(day.slice(0, 4));
    const m = Number(day.slice(5, 7));
    const key = interval === '1d' ? day.slice(0, 7) : day.slice(0, 4);
    if (key === prevKey) continue;
    const first = prevKey === '';
    prevKey = key;
    if (first) continue;
    let text: string | null = null;
    if (interval === '1d') text = m === 1 ? `${String(y).slice(2)}년` : m % 2 === 0 ? `${m}월` : null;
    else if (interval === '1wk') text = `${y}년`;
    else if (y % 2 === 0) text = `${String(y).slice(2)}년`;
    if (!text) continue;
    const px = x(i);
    if (out.length && px - out[out.length - 1].x < 34) continue;
    out.push({ x: px, text });
  }
  return out;
}

/**
 * 가격 차트: 종가 선 · 이동평균 · ▲△(30 아래) · ▼(엇갈린 고점) · 엇갈림 점선. TDS 에 차트가 없어 SVG 로 그려요.
 * 세로 범위는 원본처럼 가격만으로 잡고, 이동평균이 범위 밖으로 나간 부분은 잘라요(가격 선이 눌리지 않게).
 */
export const PriceChart = memo(function PriceChart({ model, tz, interval, label, width = 310, height = 168 }: PriceChartProps) {
  const clipId = `clip${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { c } = model;
  const n = c.length;
  if (n < 2) return null;
  let lo = Math.min(...c);
  let hi = Math.max(...c);
  const pad = (hi - lo || hi * 0.02 || 1) * 0.1;
  lo -= pad;
  hi += pad * 1.4;
  const levels = niceTicks(lo, hi);
  const labels = axisLabels(levels);
  // 오른쪽 눈금 자리는 가장 긴 눈금 글자 + 여백(원화 6자리도 선 끝점과 부딪히지 않게)
  const PR = Math.max(30, Math.ceil(Math.max(0, ...labels.map(textWidth)) + 12));
  const x = (i: number) => PL + (i / (n - 1)) * (width - PL - PR);
  const y = (v: number) => PT + ((hi - v) / (hi - lo)) * (height - PT - PB);
  const ink = c[n - 1] >= c[0] ? UP : DOWN;
  const pricePath = linePath(c, x, y);
  const div = model.divergence;
  const divInk = div?.type === 'bull' ? LOW_INK : HIGH_INK;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={label} style={{ display: 'block', overflow: 'visible' }}>
      {levels.map((v, i) => (
        <g key={v}>
          <line x1={PL} x2={width - PR + 4} y1={y(v)} y2={y(v)} stroke={colors.grey100} strokeWidth={1} />
          <text x={width - 2} y={y(v) + 4} fontSize={11} fill={colors.grey600} textAnchor="end">
            {labels[i]}
          </text>
        </g>
      ))}
      {ticks(model.t, tz, interval, x).map((tk) => (
        <g key={tk.x}>
          <line x1={tk.x} x2={tk.x} y1={height - PB} y2={height - PB + 3} stroke={colors.grey300} />
          <text x={tk.x} y={height - 5} fontSize={11} fill={colors.grey600} textAnchor="middle">
            {tk.text}
          </text>
        </g>
      ))}
      <clipPath id={clipId}>
        <rect x={PL} y={PT - 6} width={width - PL - PR} height={height - PT - PB + 6} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <path d={linePath(model.ma120, x, y)} fill="none" stroke={MA_120} strokeWidth={1.3} strokeDasharray="4 3" opacity={0.9} />
        {model.ma200 ? <path d={linePath(model.ma200, x, y)} fill="none" stroke={MA_200} strokeWidth={1.3} opacity={0.9} /> : null}
        {model.ma50w ? <path d={linePath(model.ma50w, x, y)} fill="none" stroke={MA_50W} strokeWidth={1.3} opacity={0.9} /> : null}
      </g>
      <path d={`${pricePath}L${x(n - 1).toFixed(1)},${height - PB}L${x(0).toFixed(1)},${height - PB}Z`} fill={ink} fillOpacity={0.06} />
      <path d={pricePath} fill="none" stroke={ink} strokeWidth={1.8} strokeLinejoin="round" />
      {div ? (
        <g>
          <line x1={x(div.from)} y1={y(c[div.from])} x2={x(div.to)} y2={y(c[div.to])} stroke={divInk} strokeWidth={1.6} strokeDasharray="3 2.5" />
          {[div.from, div.to].map((i) => (
            <circle key={i} cx={x(i)} cy={y(c[i])} r={3} fill="#fff" stroke={divInk} strokeWidth={1.6} />
          ))}
        </g>
      ) : null}
      {model.lowMarks.map((m) => {
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
      {model.peakMarks.map((m) => {
        const px = x(m.index);
        const py = y(c[m.index]) - 7;
        return <path key={`p${m.index}`} d={`M${px.toFixed(1)},${py.toFixed(1)}l4.6,-8h-9.2z`} fill={HIGH_INK} stroke="#fff" strokeWidth={1} />;
      })}
      <circle cx={x(n - 1)} cy={y(c[n - 1])} r={4} fill={ink} stroke="#fff" strokeWidth={2} />
    </svg>
  );
});
