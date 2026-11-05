import { colors } from '@toss/tds-colors';

import { fearGreedInk } from '../lib/palette';

/** 반원 게이지(0 왼쪽 → 100 오른쪽). TDS 에 없어 SVG 로 그려요 */
export function FearGreedGauge({ score, label, size = 200 }: { score: number; label: string; size?: number }) {
  const w = size;
  const h = size / 2 + 12;
  const r = size / 2 - 14;
  const cx = w / 2;
  const cy = size / 2;
  const at = (v: number) => {
    const a = Math.PI * (1 - v / 100);
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
  };
  const arc = (from: number, to: number) => {
    const a = at(from);
    const b = at(to);
    return `M${a.x.toFixed(1)},${a.y.toFixed(1)}A${r},${r} 0 0 1 ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  };
  const dot = at(score);
  const ink = fearGreedInk(score);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${score}점 ${label}`} style={{ display: 'block', margin: '0 auto' }}>
      <path d={arc(0, 100)} fill="none" stroke={colors.grey100} strokeWidth={14} strokeLinecap="round" />
      {score > 0 ? <path d={arc(0, score)} fill="none" stroke={ink} strokeWidth={14} strokeLinecap="round" opacity={0.9} /> : null}
      <circle cx={dot.x} cy={dot.y} r={9} fill="#fff" stroke={ink} strokeWidth={3} />
      <text x={cx} y={cy - 10} textAnchor="middle" fontSize={34} fontWeight={700} fill={colors.grey900} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={14} fontWeight={700} fill={ink}>
        {label}
      </text>
    </svg>
  );
}
