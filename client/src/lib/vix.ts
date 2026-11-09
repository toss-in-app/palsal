import { colors } from '@toss/tds-colors';

import { HIGH_INK, LOW_INK } from './palette';

/*
 * VIX 변동성지수 읽는 법(시장 탭 VIX 카드 · 용어 시트 'vix' — 사용자 2026-11-09 "VIX 활용법(수치 몇 넘으면 어떤지, 몇 아래면 어떤지)도 같이").
 * 흔히 쓰는 기준: 12 아래 아주 평온 · 12~20 평온(오랜 평균이 20 안팎) · 20~30 불안 · 30~40 공포 · 40 넘음 극단적 공포.
 * 색은 공포탐욕 게이지와 같은 뜻으로: 공포 쪽(30 넘음) 남보라 · 아주 평온(탐욕 쪽) 주황 · 그 사이 회색. 색만으로 뜻을 전하지 않게 글(구간 이름)을 늘 같이 써요.
 */

export type VixZone = 'vcalm' | 'calm' | 'uneasy' | 'fear' | 'panic';

/** 구간 경계(이 값 이상이면 다음 구간) */
export const VIX_LINES = [12, 20, 30, 40] as const;

export function vixZone(v: number): VixZone {
  if (v < 12) return 'vcalm';
  if (v < 20) return 'calm';
  if (v < 30) return 'uneasy';
  if (v < 40) return 'fear';
  return 'panic';
}

export const VIX_LABEL: Record<VixZone, string> = { vcalm: '아주 평온', calm: '평온', uneasy: '불안', fear: '공포', panic: '극단적 공포' };

/** 구간 글자 색(흰 바탕 4.5:1 넘게) */
export function vixInk(z: VixZone): string {
  if (z === 'fear' || z === 'panic') return LOW_INK;
  if (z === 'vcalm') return HIGH_INK;
  return colors.grey700;
}

/** 카드 아래 한 줄 — 기준을 늘 보여 줘요(자세한 설명은 (i) 시트). 320 화면에서도 한 줄 */
export const VIX_HINT = '20 아래 평온 · 30 넘으면 공포';
