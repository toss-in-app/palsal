import { colors } from '@toss/tds-colors';

import type { Zone } from './indicators';

/*
 * 색 — 시안 v2(사용자 채택, 2026-11-05): 오름 빨강 · 내림 파랑(국내 관례), RSI 낮음 남보라 · 높음 주황.
 * 남보라·주황 진한 값은 TDS 팔레트에 없어 시안 값을 그대로 써요(글자 대비 4.5:1 이상).
 */
export const UP = colors.red500;
export const DOWN = colors.blue500;
export const FLAT = colors.grey600;

export const LOW_INK = '#4A3AFF';
export const LOW_BG = '#EEEDFF';
export const HIGH_INK = '#E8590C';
export const HIGH_BG = '#FFEFE3';

/** 120선(점선) · 200일선 · 50주선 */
export const MA_120 = colors.orange500;
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

export function changeColor(diff: number): string {
  return diff > 0 ? UP : diff < 0 ? DOWN : FLAT;
}
