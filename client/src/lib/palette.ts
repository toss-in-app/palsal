import { colors } from '@toss/tds-colors';

import type { Zone } from './indicators';

/*
 * 색 — 시안 v2(사용자 채택, 2026-11-05): 오름 빨강 · 내림 파랑(국내 관례), RSI 낮음 남보라 · 높음 주황.
 * 남보라·주황 진한 값은 TDS 팔레트에 없어 시안 값을 써요.
 * 2026-11-08 대비 점검: 선·점·아이콘(그림, 3:1)은 500 단계, **글자(4.5:1)는 더 진한 값**으로 나눠요 —
 * red500·blue500 은 흰 바탕에 3.7:1, 예전 주황 #E8590C 는 3.6:1(딱지 바탕에선 3.2:1)이라 13px 글자엔 모자랐어요.
 */
export const UP = colors.red500;
export const DOWN = colors.blue500;
export const FLAT = colors.grey600;
/** 등락 글자(13~15px) — red700 5.3:1 · blue700 5.4:1 */
export const UP_TEXT = colors.red700;
export const DOWN_TEXT = colors.blue700;

export const LOW_INK = '#4A3AFF'; // 흰 바탕 6.3:1 · LOW_BG 5.5:1
export const LOW_BG = '#EEEDFF';
export const HIGH_INK = '#BF4506'; // 흰 바탕 5.2:1 · HIGH_BG 4.6:1
export const HIGH_BG = '#FFEFE3';

/** 120선(점선) · 200일선 · 50주선 — 선은 그림이라 3:1(orange800 3.2 · grey500 3.0 · purple500 5.5) */
export const MA_120 = colors.orange800;
export const MA_200 = colors.grey500;
export const MA_50W = colors.purple500;

export const PAGE_BG = colors.greyBackground;

export function zoneInk(z: Zone): string {
  return z === 'high' ? HIGH_INK : z === 'mid' ? colors.grey700 : LOW_INK;
}

export function zoneBg(z: Zone): string {
  return z === 'high' ? HIGH_BG : z === 'mid' ? colors.grey100 : LOW_BG;
}

export const ZONE_LABEL: Record<Zone, string> = { vlow: '아주 낮음', low: '낮음', mid: '보통', high: '높음' };

/** 등락 글자 색(글자에만 — 선·점은 UP · DOWN) */
export function changeColor(diff: number): string {
  return diff > 0 ? UP_TEXT : diff < 0 ? DOWN_TEXT : FLAT;
}

/** 공포탐욕 점수 → 색(공포 남보라 · 중립 회색 · 탐욕 주황 — RSI 구간 색과 같은 계열) */
export function fearGreedInk(score: number): string {
  if (score <= 44) return LOW_INK;
  if (score <= 55) return colors.grey600;
  return HIGH_INK;
}
