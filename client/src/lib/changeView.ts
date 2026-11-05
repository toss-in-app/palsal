import { symbolIndex } from '../content';
import { eventTitle } from './events';
import { formatPrice, formatRsi, INTERVAL_LABEL, marketOf, unitOf } from './format';
import { DOWN, HIGH_INK, LOW_INK, UP } from './palette';
import type { Interval } from './series';
import { relativeDay, type ChangeItem } from '../state/changes';
import type { IconName } from '../components/Icon';

/** 변화 하나를 그릴 때 쓰는 값(배너 카드 · 최근 바뀐 것 줄이 같이 써요) */
export interface ChangeView {
  icon: IconName;
  ink: string;
  title: string;
  sub: string;
  symbol: string;
  interval: Interval;
}

/** 아이콘 · 색(장식 상자 없이 아이콘만 그려요) */
const MARK: Record<ChangeItem['kind'], [IconName, string]> = {
  rsi_low_enter: ['down', LOW_INK],
  rsi_high_enter: ['up', HIGH_INK],
  ma_cross_up: ['xcross', UP],
  ma_cross_down: ['xcross', DOWN],
  high5y: ['star', UP],
};

export function changeView(c: ChangeItem, now = Date.now()): ChangeView {
  const [symbol, interval] = c.watchId.split('|') as [string, Interval];
  const info = symbolIndex.get(symbol);
  const name = info?.n ?? symbol;
  const [icon, ink] = MARK[c.kind];
  const market = marketOf(symbol, info);
  let middle = '';
  if ((c.kind === 'rsi_low_enter' || c.kind === 'rsi_high_enter') && c.from !== null && c.to !== null) middle = ` · RSI ${formatRsi(c.from)} → ${formatRsi(c.to)}`;
  if (c.kind === 'high5y' && c.to !== null) middle = ` · ${formatPrice(c.to, unitOf(symbol, market), market === 'FX')}`;
  return {
    icon,
    ink,
    title: `${name} ${eventTitle({ kind: c.kind, t: 0 }, interval)}`,
    sub: `${INTERVAL_LABEL[interval]}${middle} · ${relativeDay(c.date, now)}`,
    symbol,
    interval,
  };
}

/** 열 때 요약 토스트: '지금 RSI 30 아래 2개, 70 위 1개예요' — 둘 다 0이면 null */
export function summaryText(low: number, high: number): string | null {
  const parts = [low ? `30 아래 ${low}개` : '', high ? `70 위 ${high}개` : ''].filter(Boolean);
  return parts.length ? `지금 RSI ${parts.join(', ')}예요` : null;
}
