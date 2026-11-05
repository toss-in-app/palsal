import { colors } from '@toss/tds-colors';
import type { ReactNode } from 'react';

import type { TabName } from '../lib/router';

/** 떠 있는 탭 막대 3개(흐름 문서: 내 종목 · 시장 · 설정). 아이콘은 v2 시안의 선 아이콘 */
const ITEMS: { name: TabName; label: string; icon: ReactNode }[] = [
  {
    name: 'home',
    label: '내 종목',
    icon: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="2" />
        <rect x="13" y="4" width="7" height="7" rx="2" />
        <rect x="4" y="13" width="7" height="7" rx="2" />
        <rect x="13" y="13" width="7" height="7" rx="2" />
      </>
    ),
  },
  { name: 'market', label: '시장', icon: <path d="M5 19v-5M10.3 19V6M15.6 19v-8M21 19v-3" /> },
  {
    name: 'settings',
    label: '설정',
    icon: (
      <>
        <path d="M4 7h9M18 7h2M4 17h3M11 17h9" />
        <circle cx="15.5" cy="7" r="2.3" />
        <circle cx="8.5" cy="17" r="2.3" />
      </>
    ),
  },
];

export interface TabBarProps {
  active: TabName;
  onSelect: (tab: TabName) => void;
}

/** 지금 탭은 aria-current */
export function TabBar({ active, onSelect }: TabBarProps) {
  return (
    <nav
      aria-label="탭"
      style={{
        position: 'fixed',
        left: 18,
        right: 18,
        bottom: 'calc(18px + env(safe-area-inset-bottom, 0px))',
        height: 64,
        borderRadius: 24,
        background: '#FFFFFF',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.05), 0 8px 28px rgba(0,27,55,0.12)',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        alignItems: 'center',
        padding: '0 6px',
        zIndex: 10,
      }}
    >
      {ITEMS.map((item) => {
        const on = item.name === active;
        const color = on ? colors.grey900 : colors.grey400;
        return (
          <button
            key={item.name}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => onSelect(item.name)}
            style={{
              height: 56,
              border: 0,
              background: 'transparent',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              color,
              font: 'inherit',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {item.icon}
            </svg>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
