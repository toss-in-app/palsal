import type { Market, SymbolEntry } from '../content';
import type { ExchangeTz, Interval } from './series';

/** 심볼 꼴로 시장 추정(종목 목록에 없을 때만) — 서버 어댑터와 같은 규칙 */
export function marketOf(symbol: string, entry?: SymbolEntry): Market {
  if (entry) return entry.m;
  if (/\.(KS|KQ)$/.test(symbol) || /^\^(KS|KQ)/.test(symbol)) return 'KR';
  if (symbol.endsWith('-USD')) return 'CRYPTO';
  if (symbol.endsWith('=X')) return 'FX';
  return 'US';
}

export function tzOf(market: Market): ExchangeTz {
  if (market === 'KR') return 'Asia/Seoul';
  if (market === 'US') return 'America/New_York';
  return 'UTC';
}

const EXCHANGE: Record<string, string> = {
  KOSPI: '코스피',
  KOSDAQ: '코스닥',
  NASDAQ: '나스닥',
  NYSE: '뉴욕',
  NYSEARCA: 'NYSE Arca',
  AMEX: '아멕스',
  BINANCE: '코인',
  FX: '환율',
};

/** 카드 둘째 줄: '035720 · 코스피' · 'NVDA · 나스닥' · 'BTC · 코인' · 'USD/KRW · 환율' */
export function codeLine(symbol: string, entry?: SymbolEntry): string {
  const market = marketOf(symbol, entry);
  const place = entry?.x ? (EXCHANGE[entry.x] ?? entry.x) : { KR: '국내', US: '미국', CRYPTO: '코인', FX: '환율' }[market];
  if (symbol.startsWith('^')) return `${symbol.slice(1)} · 지수`;
  if (market === 'KR') return `${symbol.replace(/\.(KS|KQ)$/, '')} · ${place}`;
  if (market === 'CRYPTO') return `${symbol.replace(/-USD$/, '')} · ${place}`;
  if (market === 'FX') {
    const pair = symbol.replace(/=X$/, '');
    return `${pair.slice(0, 3)}/${pair.slice(3)} · ${place}`;
  }
  return `${symbol} · ${place}`;
}

/** 이름 앞 동그라미에 넣을 한 글자 */
export function avatarText(name: string): string {
  return Array.from(name.trim())[0] ?? '?';
}

export type Unit = 'KRW' | 'USD' | 'POINT';

export function unitOf(symbol: string, market: Market): Unit {
  if (symbol.startsWith('^')) return 'POINT';
  return market === 'KR' || market === 'FX' ? 'KRW' : 'USD';
}

function digits(v: number, unit: Unit, fx: boolean): number {
  const a = Math.abs(v);
  if (unit === 'POINT' || fx) return 2;
  if (unit === 'KRW') return a >= 100 ? 0 : 2;
  if (a >= 10_000) return 0;
  if (a >= 1) return 2;
  return 4;
}

function grouped(v: number, d: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** 41,250원 · $201.37 · $104,820 · 1,438.20원 · 2,601.53 */
export function formatPrice(v: number, unit: Unit, fx = false): string {
  const s = grouped(v, digits(v, unit, fx));
  if (unit === 'KRW') return `${s}원`;
  if (unit === 'USD') return `$${s}`;
  return s;
}

/** +222원 · -$5.72 · +$2,318 · +12.40 — 부호는 늘 붙이고, 자릿수는 가격(ref)에 맞춰요 */
export function formatChange(diff: number, unit: Unit, fx = false, ref = Math.abs(diff) || 1): string {
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
  const s = grouped(Math.abs(diff), digits(ref, unit, fx));
  if (unit === 'KRW') return `${sign}${s}원`;
  if (unit === 'USD') return `${sign}$${s}`;
  return `${sign}${s}`;
}

/** +0.54% · -2.10% */
export function formatPct(p: number): string {
  const sign = p > 0 ? '+' : p < 0 ? '-' : '';
  return `${sign}${Math.abs(p).toFixed(2)}%`;
}

/** RSI 는 소수 첫째 자리까지 */
export function formatRsi(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1);
}

export const INTERVAL_LABEL: Record<Interval, string> = { '1d': '일봉', '1wk': '주봉', '1mo': '월봉' };
/** '최근 180일' 의 단위 · 이동평균 이름의 단위 */
export const BAR_UNIT: Record<Interval, string> = { '1d': '일', '1wk': '주', '1mo': '개월' };

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** 봉 시작 epoch 초 → 거래소 현지 '9월 3일' (해가 다르면 '2025년 9월 3일') */
export function formatBarDate(epochSec: number, tz: ExchangeTz, now: Date = new Date()): string {
  let f = dayFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' });
    dayFormatters.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(new Date(epochSec * 1000)).map((p) => [p.type, p.value]));
  const thisYear = String(new Date(now.getTime() + 9 * 3_600_000).getUTCFullYear());
  const md = `${Number(parts.month)}월 ${Number(parts.day)}일`;
  return parts.year === thisYear ? md : `${parts.year}년 ${md}`;
}

/** epoch ms → 한국 시각 '15:30' */
export function formatKstTime(epochMs: number): string {
  const d = new Date(epochMs + 9 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
