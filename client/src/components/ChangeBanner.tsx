import { colors } from '@toss/tds-colors';
import { Text } from '@toss/tds-mobile';
import { useEffect, useRef, useState } from 'react';

import { logEventOnce } from '../lib/analytics';

import { changeView } from '../lib/changeView';
import { DOWN, UP } from '../lib/palette';
import type { CardsState } from '../state/cards';
import type { ChangeItem } from '../state/changes';
import { ChangeIcon } from './ChangeIcon';
import { Icon } from './Icon';

/** 배너에 보이는 최대 장 수(나머지는 '모두 보기') */
export const BANNER_MAX = 10;

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 44;
  const h = 24;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const y = (v: number) => 2 + ((hi - v) / (hi - lo || 1)) * (h - 4);
  const ink = values[values.length - 1] >= values[0] ? UP : DOWN;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ flex: 'none' }}>
      <path d={d} fill="none" stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

export interface ChangeBannerProps {
  items: ChangeItem[];
  cards: CardsState;
  onOpen: (c: ChangeItem) => void;
  onAll: () => void;
}

/** 내 종목 맨 위 '최근 바뀐 것'(시안 v2): 옆으로 넘기는 카드 최대 10장 + 모두 보기 */
export function ChangeBanner({ items, cards, onOpen, onAll }: ChangeBannerProps) {
  const strip = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const shown = items.slice(0, BANNER_MAX);
  useEffect(() => {
    if (shown.length) logEventOnce('change_banner_view', { count: shown.length });
  }, [shown.length]);
  if (!shown.length) return null;

  const onScroll = () => {
    const el = strip.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    setPage(Math.min(shown.length - 1, Math.round(el.scrollLeft / (first.offsetWidth + 12))));
  };

  return (
    <section aria-label="최근 바뀐 것">
      {/* 회색 바탕 위 작은 글자는 grey700(4.5:1 넘게) */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 24px 8px' }}>
        <Text typography="t6" fontWeight="bold" color={colors.grey900}>
          최근 바뀐 것 <span style={{ color: colors.grey700, fontWeight: 600 }}>{items.length}</span>
        </Text>
        <button type="button" onClick={onAll} className="tap" style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: 13, fontWeight: 600, color: colors.grey700, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
          모두 보기
          <Icon name="chev" size={14} color={colors.grey700} />
        </button>
      </div>
      <div ref={strip} onScroll={onScroll} style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory', padding: '0 20px', scrollPadding: '0 20px', scrollbarWidth: 'none' }}>
        {shown.map((c) => {
          const v = changeView(c);
          const closes = cards.entries[c.watchId]?.analysis?.chart.c.slice(-48) ?? [];
          return (
            <button
              key={`${c.watchId}|${c.kind}|${c.date}`}
              type="button"
              onClick={() => onOpen(c)}
              className="tap"
              style={{
                // 하나면 아래 종목 카드와 폭을 맞추고(칸을 꽉 채움, 긴 제목은 줄을 바꿔요 — 전엔 글이 길면 카드가 화면 밖으로 밀려 잘렸어요), 여럿이면 다음 카드가 살짝 보이게
                flex: shown.length === 1 ? '1 1 0%' : 'none',
                minWidth: 0,
                width: shown.length === 1 ? 'auto' : 'min(322px, calc(100% - 40px))',
                scrollSnapAlign: 'start',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: colors.background,
                borderRadius: 16,
                padding: '14px 16px',
                border: 0,
                textAlign: 'left',
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
              <ChangeIcon view={v} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <Text display="block" typography="t7" fontWeight="semibold" color={colors.grey900} style={{ lineHeight: 1.45 }}>
                  {v.title}
                </Text>
                <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {v.sub}
                </Text>
              </span>
              <Spark values={closes} />
            </button>
          );
        })}
      </div>
      {shown.length > 1 ? (
        <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
          {shown.map((c, i) => (
            <span key={`${c.watchId}|${c.kind}|${c.date}`} style={{ width: i === page ? 16 : 6, height: 6, borderRadius: 3, background: i === page ? colors.grey700 : colors.grey300 }} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
