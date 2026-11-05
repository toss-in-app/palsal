import { colors } from '@toss/tds-colors';
import { Button, Text, Top } from '@toss/tds-mobile';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Icon, type IconName } from '../components/Icon';
import { Pill } from '../components/Pill';
import { StockCard } from '../components/StockCard';
import { symbolIndex } from '../content';
import { formatDateLabel } from '../lib/date';
import { formatKstTime } from '../lib/format';
import { HIGH_LINE, LOW_LINE } from '../lib/indicators';
import { HIGH_INK, LOW_INK, MA_120, MA_200, MA_50W, PAGE_BG } from '../lib/palette';
import { loadCards, refreshQuotes, retryCard, rsiOfEntry, type CardsState } from '../state/cards';
import type { Filter } from '../state/settings';
import type { WatchItem } from '../state/watch';

/** 한 번에 더 불러올 카드 수 */
export const PAGE = 4;
/** 보는 동안 현재가를 다시 읽는 간격(서버 갱신 간격과 같아요) */
export const AUTO_REFRESH_MS = 5 * 60_000;

export interface HomeScreenProps {
  /** 한국 날짜 'YYYY-MM-DD' */
  today: string;
  items: WatchItem[];
  cards: CardsState;
  filter: Filter;
  autoRefresh: boolean;
  notice: string | null;
  disclaimer: string;
  online: boolean;
  onFilter: (f: Filter) => void;
  onAdd: () => void;
  onOpenMarket: () => void;
  onOpen: (item: WatchItem) => void;
  onToast: (text: string) => void;
}

/** 다른 화면에 다녀와도 같은 자리로 */
let savedScroll = 0;
let savedLimit = PAGE;

function HeaderButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{ width: 40, height: 40, borderRadius: 20, border: 0, background: colors.background, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,27,55,.04)' }}
    >
      <Icon name={icon} size={20} color={colors.grey700} strokeWidth={icon === 'plus' ? 2.4 : 2} />
    </button>
  );
}

function Legend() {
  const row = { display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: 11.5, color: colors.grey600, padding: '6px 24px 0' } as const;
  return (
    <div aria-label="차트 표시 읽는 법">
      <div style={row}>
        <span>
          <span style={{ color: LOW_INK }}>▲</span> 30 아래 마감
        </span>
        <span>
          <span style={{ color: LOW_INK }}>△</span> 장중만
        </span>
        <span>
          <span style={{ color: HIGH_INK }}>▼</span> 엇갈린 고점
        </span>
      </div>
      <div style={{ ...row, paddingTop: 3 }}>
        <span>
          <span style={{ color: MA_120 }}>┄</span> 120일선
        </span>
        <span>
          <span style={{ color: MA_200 }}>—</span> 200일선
        </span>
        <span>
          <span style={{ color: MA_50W }}>—</span> 50주선
        </span>
      </div>
    </div>
  );
}

/**
 * 내 종목(탭 1, 시안 v2): 머리 → (변화 배너: 다음 기능) → 칩 + 범례 → 차트 카드가 이어짐.
 * 처음엔 4장만 그리고, 끝에 닿기 전에 다음 4장을 불러와요. 다 나오면 '종목 담기'.
 */
export function HomeScreen(props: HomeScreenProps) {
  const { today, items, cards, filter, autoRefresh, notice, disclaimer, online, onFilter, onAdd, onOpenMarket, onOpen, onToast } = props;
  const [limit, setLimit] = useState(savedLimit);
  const sentinel = useRef<HTMLDivElement>(null);
  const lastRefresh = useRef(Date.now());

  const rsiOf = useCallback((it: WatchItem) => rsiOfEntry(cards.entries[it.id], it.id), [cards]);
  const counts = useMemo(() => {
    let low = 0;
    let high = 0;
    for (const it of items) {
      const r = rsiOf(it);
      if (r === null) continue;
      if (r <= LOW_LINE) low += 1;
      else if (r >= HIGH_LINE) high += 1;
    }
    return { low, high };
  }, [items, rsiOf]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((it) => {
      const r = rsiOf(it);
      return r !== null && (filter === 'low' ? r <= LOW_LINE : r >= HIGH_LINE);
    });
  }, [items, filter, rsiOf]);

  const shown = filtered.slice(0, limit);
  const more = filtered.length > shown.length;
  const shownKey = shown.map((it) => it.id).join(',');

  useEffect(() => {
    savedLimit = limit;
  }, [limit]);

  useEffect(() => {
    if (shown.length) void loadCards(shown);
    // shownKey 가 바뀔 때만(같은 목록이면 다시 부르지 않아요)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((list) => list.some((e) => e.isIntersecting) && setLimit((l) => l + PAGE), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, shownKey]);

  useLayoutEffect(() => {
    if (savedScroll) window.scrollTo(0, savedScroll);
    return () => {
      savedScroll = window.scrollY;
    };
  }, []);

  const refresh = useCallback(
    async (manual: boolean) => {
      lastRefresh.current = Date.now();
      const result = await refreshQuotes(items);
      if (manual) onToast(result === 'error' ? '시세를 불러오지 못했어요' : '지금 시세로 바꿨어요');
    },
    [items, onToast],
  );

  useEffect(() => {
    if (!autoRefresh) return;
    const tick = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current >= AUTO_REFRESH_MS - 1000) void refresh(false);
    };
    const timer = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [autoRefresh, refresh]);

  const nextIn = Math.max(0, AUTO_REFRESH_MS - (Date.now() - lastRefresh.current));
  const refreshLabel = autoRefresh ? `지금 새로고침 · 다음 자동 새로고침까지 ${Math.ceil(nextIn / 60_000)}분` : '지금 새로고침';

  return (
    <main style={{ minHeight: '100vh', background: PAGE_BG, paddingBottom: 120 }}>
      <Top
        style={{ background: PAGE_BG }}
        subtitleTop={<Top.SubtitleParagraph size={13}>{`${formatDateLabel(today)}${cards.latestAt ? ` · ${formatKstTime(cards.latestAt)} 기준` : ''}`}</Top.SubtitleParagraph>}
        title={<Top.TitleParagraph size={22}>{`내 종목 ${items.length}`}</Top.TitleParagraph>}
        right={
          <div style={{ display: 'flex', gap: 6, marginRight: 20 }}>
            <HeaderButton icon="plus" label="종목 담기" onClick={onAdd} />
            {items.length ? <HeaderButton icon="refresh" label={refreshLabel} onClick={() => void refresh(true)} /> : null}
          </div>
        }
      />
      {!online ? (
        <Text display="block" typography="t7" color={colors.grey700} style={{ margin: '0 24px 8px' }}>
          인터넷 연결이 없어 마지막으로 받은 값을 보여 줘요
        </Text>
      ) : null}
      {notice ? (
        <Text display="block" typography="t7" color={colors.grey700} style={{ margin: '0 24px 8px' }}>
          {notice}
        </Text>
      ) : null}

      {items.length === 0 ? (
        <section aria-label="담아 둔 종목" style={{ margin: '8px 20px 0', padding: '28px 20px 20px', borderRadius: 20, background: colors.background, textAlign: 'center' }}>
          <Text display="block" typography="t5" fontWeight="bold" color={colors.grey900}>
            담아 둔 종목이 없어요
          </Text>
          <Text display="block" typography="t7" color={colors.grey600} style={{ marginTop: 6 }}>
            종목을 담으면 RSI와 차트를 여기서 이어서 볼 수 있어요
          </Text>
          <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
            <Button display="block" size="large" onClick={onAdd}>
              첫 종목 담기
            </Button>
            <Button display="block" size="large" variant="weak" onClick={onOpenMarket}>
              시장에서 큰 종목 보기
            </Button>
          </div>
        </section>
      ) : (
        <>
          <div role="group" aria-label="RSI로 걸러 보기" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 24px 0' }}>
            <Pill on={filter === 'all'} onClick={() => onFilter('all')}>{`전체 ${items.length}`}</Pill>
            <Pill on={filter === 'low'} onClick={() => onFilter('low')}>{`30 아래 ${counts.low}`}</Pill>
            <Pill on={filter === 'high'} onClick={() => onFilter('high')}>{`70 위 ${counts.high}`}</Pill>
          </div>
          <Legend />

          <section aria-label="내 종목 차트" style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '12px 16px 0' }}>
            {shown.map((it) => (
              <StockCard key={it.id} item={it} entry={cards.entries[it.id]} info={symbolIndex.get(it.symbol)} onOpen={onOpen} onRetry={(x) => void retryCard(x)} />
            ))}
            {filtered.length === 0 ? (
              <Text display="block" typography="t6" color={colors.grey600} style={{ padding: '28px 8px', textAlign: 'center' }}>
                {filter === 'low' ? '지금은 RSI 30 아래인 종목이 없어요' : '지금은 RSI 70 위인 종목이 없어요'}
              </Text>
            ) : null}
            {more ? (
              <div ref={sentinel} aria-label="다음 종목을 불러오는 중" style={{ background: colors.background, borderRadius: 20, padding: '20px 16px', textAlign: 'center' }}>
                <span aria-hidden="true" style={{ display: 'block', height: 120, borderRadius: 12, background: colors.grey100 }} />
                <Text display="block" typography="t7" color={colors.grey500} style={{ marginTop: 12 }}>
                  다음 종목을 불러오고 있어요
                </Text>
              </div>
            ) : filter === 'all' ? (
              <Button display="block" size="large" variant="weak" onClick={onAdd} style={{ marginTop: 6 }}>
                종목 담기
              </Button>
            ) : null}
          </section>
        </>
      )}

      <Text display="block" typography="t7" color={colors.grey500} style={{ margin: '24px 24px 0', lineHeight: 1.6 }}>
        {disclaimer}
      </Text>
    </main>
  );
}
