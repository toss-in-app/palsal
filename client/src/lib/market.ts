import { lastRsi } from './indicators';

/*
 * 공포탐욕(한국·미국) — 원본과 같은 공식. 코스피 지수(^KS11)·SPY 일봉으로:
 *   위치 점수 = 50 + (종가 − 120일 평균) / 120일 평균 × 100 × 2.5   (0~100 으로 자름, 봉이 120개보다 적으면 50)
 *   점수 = RSI(14) × 0.6 + 위치 점수 × 0.4                          (RSI 가 없으면 위치 점수만, 정수로)
 * 코인은 alternative.me 값을 그대로 써요(서버가 받아 둠). 서버 palsal-fetch 도 이 공식과 같아야 해요(계약 server.md).
 */
export function fearGreedScore(closes: readonly number[]): number | null {
  if (closes.length < 20) return null;
  const price = closes[closes.length - 1];
  let position = 50;
  if (closes.length >= 120) {
    let sum = 0;
    for (let i = closes.length - 120; i < closes.length; i++) sum += closes[i];
    const ma = sum / 120;
    position = 50 + ((price - ma) / ma) * 100 * 2.5;
  }
  position = Math.max(0, Math.min(100, position));
  const rsi = lastRsi(closes);
  const score = rsi === null ? position : rsi * 0.6 + position * 0.4;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export type FearGreedLabel = '극단적 공포' | '공포' | '중립' | '탐욕' | '극단적 탐욕';

/** ≤24 극단적 공포 · ≤44 공포 · ≤55 중립 · ≤75 탐욕 · 그 위 극단적 탐욕(계약 server.md) */
export function fearGreedLabel(score: number): FearGreedLabel {
  if (score <= 24) return '극단적 공포';
  if (score <= 44) return '공포';
  if (score <= 55) return '중립';
  if (score <= 75) return '탐욕';
  return '극단적 탐욕';
}
