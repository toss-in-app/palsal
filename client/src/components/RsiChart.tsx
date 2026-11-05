import { colors } from '@toss/tds-colors';
import { memo } from 'react';

import { HIGH_LINE, LOW_LINE, zoneOf } from '../lib/indicators';
import { HIGH_BG, LOW_BG, zoneInk } from '../lib/palette';

export interface RsiChartProps {
  /** 가격 차트와 같은 칸의 RSI */
  rsi: (number | null)[];
  label: string;
  width?: number;
  height?: number;
}

// 가격 차트와 좌우 여백을 같게 둬서 같은 날짜가 위아래로 맞아요
const PL = 2;
const PR = 48;
const PT = 6;
const PB = 6;

/** RSI 흐름: 0~100, 30 아래·70 위를 옅게 칠하고 선을 그어요 */
export const RsiChart = memo(function RsiChart({ rsi, label, width = 326, height = 112 }: RsiChartProps) {
  const n = rsi.length;
  if (n < 2) return null;
  const x = (i: number) => PL + (i / (n - 1)) * (width - PL - PR);
  const y = (v: number) => PT + ((100 - v) / 100) * (height - PT - PB);
  let d = '';
  let open = false;
  let last: { i: number; v: number } | null = null;
  rsi.forEach((v, i) => {
    if (v === null) {
      open = false;
      return;
    }
    d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    open = true;
    last = { i, v };
  });
  const end = last as { i: number; v: number } | null;
  const right = width - PR;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={label} style={{ display: 'block', overflow: 'visible' }}>
      <rect x={PL} y={y(100)} width={right - PL} height={y(HIGH_LINE) - y(100)} fill={HIGH_BG} />
      <rect x={PL} y={y(LOW_LINE)} width={right - PL} height={y(0) - y(LOW_LINE)} fill={LOW_BG} />
      {[HIGH_LINE, LOW_LINE].map((v) => (
        <g key={v}>
          <line x1={PL} x2={right + 4} y1={y(v)} y2={y(v)} stroke={colors.grey300} strokeDasharray="3 3" />
          <text x={width - 2} y={y(v) + 4} fontSize={10.5} fill={colors.grey500} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke={colors.grey800} strokeWidth={1.5} strokeLinejoin="round" />
      {end ? <circle cx={x(end.i)} cy={y(end.v)} r={4} fill={zoneInk(zoneOf(end.v))} stroke="#fff" strokeWidth={2} /> : null}
    </svg>
  );
});
