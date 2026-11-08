import { colors } from '@toss/tds-colors';

import { DOWN, UP } from '../lib/palette';

/*
 * 팔껄살껄 로고 표(console/logo.svg 와 같은 그림, 글자 '팔껄·살껄'은 작게 그리면 안 읽혀 뺐어요):
 * 꺾은선 차트의 바닥엔 빨간 점선 동그라미(살껄), 꼭대기엔 파란 점선 동그라미(팔껄).
 * 앱 안에서 쓰는 곳 — 내 종목 머리(토스 홈처럼 첫 탭 왼쪽 위에만) · 설정 맨 아래 앱 이름 옆(사용자 2026-11-08 "로고도 넣어줘").
 */
export function Logo({ size = 24, tile = false }: { size?: number; tile?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={
        tile
          ? { display: 'inline-flex', width: size, height: size, borderRadius: Math.round(size * 0.22), background: colors.background, border: `1px solid ${colors.grey200}`, boxSizing: 'border-box', padding: Math.round(size * 0.12), flex: 'none' }
          : { display: 'inline-flex', width: size, height: size, flex: 'none' }
      }
    >
      <svg viewBox="40 33 520 520" width="100%" height="100%" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        <polyline points="56,398 130,318 190,448 260,268 320,348 400,138 470,288 544,218" stroke={colors.grey900} strokeWidth={34} />
        <circle cx="190" cy="448" r="54" stroke={UP} strokeWidth={22} strokeDasharray="30 22" />
        <circle cx="400" cy="138" r="54" stroke={DOWN} strokeWidth={22} strokeDasharray="30 22" />
      </svg>
    </span>
  );
}
