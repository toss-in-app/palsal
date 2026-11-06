import { colors } from '@toss/tds-colors';
import { Checkbox, FixedBottomCTA, List, ListRow, SearchField, SegmentedControl, Text } from '@toss/tds-mobile';
import { useEffect, useMemo, useState } from 'react';

import { Pill } from '../components/Pill';
import type { Market, SymbolEntry } from '../content';
import type { MarketSource, QuoteRow } from '../data/types';
import { codeLine, formatPrice, INTERVAL_LABEL, unitOf } from '../lib/format';
import type { Interval } from '../lib/series';
import { searchSymbols } from '../lib/search';
import { logEvent } from '../lib/analytics';
import { WATCH_MAX, watchId, type WatchItem } from '../state/watch';

const TABS: { id: Market; label: string; hint: string }[] = [
  { id: 'KR', label: '국내 주식', hint: '초성으로도 찾을 수 있어요 · ㅅㅅㅈㅈ' },
  { id: 'US', label: '해외 주식', hint: '이름이나 티커로 찾아요 · 엔비디아, NVDA' },
  { id: 'CRYPTO', label: '코인', hint: '이름이나 기호로 찾아요 · 비트코인, BTC' },
  { id: 'FX', label: '환율', hint: '원화로 본 환율이에요' },
];
const INTERVALS: Interval[] = ['1d', '1wk', '1mo'];
/** 가격을 같이 보여 주는 검색 결과 수(현재가 묶음 조회 한 번) */
const PRICE_ROWS = 10;

export interface AddScreenProps {
  symbols: SymbolEntry[];
  rank: Map<string, number>;
  watched: WatchItem[];
  source: MarketSource | null;
  /** 실제로 담은 수를 돌려줘요 */
  onAdd: (entries: { symbol: string; interval: Interval }[]) => number;
  onDone: (added: number) => void;
  onToast: (text: string) => void;
}

/** 종목 담기: 찾기 + 분류 + 여러 개 고르기 + 봉 단위 → 'N개 담기' */
export function AddScreen({ symbols, rank, watched, source, onAdd, onDone, onToast }: AddScreenProps) {
  const [tab, setTab] = useState<Market>('KR');
  const [query, setQuery] = useState('');
  const [interval, setBarInterval] = useState<Interval>('1d');
  const [picked, setPicked] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, QuoteRow>>({});

  const results = useMemo(() => searchSymbols(symbols, query, tab, rank), [symbols, query, tab, rank]);
  const have = useMemo(() => new Set(watched.map((w) => w.id)), [watched]);
  const room = WATCH_MAX - watched.length;

  const priceKey = results
    .slice(0, PRICE_ROWS)
    .map((e) => e.s)
    .join(',');
  useEffect(() => {
    if (!source || !priceKey) return;
    let live = true;
    const timer = setTimeout(() => {
      source
        .quotes(priceKey.split(','))
        .then((rows) => live && setPrices((p) => ({ ...p, ...Object.fromEntries(rows.map((r) => [r.symbol, r])) })))
        .catch(() => undefined);
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [source, priceKey]);

  // 검색 결과가 보일 때(입력이 멈춘 뒤 한 번) — 검색어 원문은 보내지 않아요(events.md)
  const resultCount = results.length;
  useEffect(() => {
    const timer = setTimeout(() => logEvent('search', { tab: tab.toLowerCase(), hasQuery: query.trim().length > 0, results: resultCount }), 800);
    return () => clearTimeout(timer);
  }, [query, tab, resultCount]);

  const toggle = (s: string) => {
    setPicked((p) => {
      if (p.includes(s)) return p.filter((x) => x !== s);
      if (p.length >= room) {
        onToast('더 담으려면 몇 개를 빼 주세요');
        return p;
      }
      return [...p, s];
    });
  };

  const fresh = picked.filter((s) => !have.has(watchId(s, interval)));
  const submit = () => {
    const n = onAdd(fresh.map((symbol) => ({ symbol, interval })));
    onDone(n);
  };

  const hint = TABS.find((t) => t.id === tab)!.hint;

  return (
    <main style={{ paddingBottom: 140 }}>
      <Text display="block" typography="t3" fontWeight="bold" color={colors.grey900} style={{ padding: '12px 24px 12px' }}>
        종목 담기
      </Text>
      <SearchField
        autoFocus
        placeholder="종목 이름이나 티커"
        aria-label="담을 종목 찾기"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onDeleteClick={() => setQuery('')}
        enterKeyHint="search"
      />
      <div role="group" aria-label="분류" style={{ display: 'flex', gap: 6, padding: '12px 24px 0', overflowX: 'auto' }}>
        {TABS.map((t) => (
          <Pill key={t.id} on={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </Pill>
        ))}
      </div>
      <Text display="block" typography="t7" color={colors.grey500} style={{ margin: '10px 24px 4px' }}>
        {query.trim() && !results.length ? '찾는 종목이 없어요. 다른 이름이나 티커로 찾아보세요.' : hint}
      </Text>

      <List aria-label="찾은 종목">
        {results.map((e) => {
          const done = have.has(watchId(e.s, interval));
          const on = done || picked.includes(e.s);
          const q = prices[e.s];
          return (
            <ListRow
              key={e.s}
              withTouchEffect={!done}
              onClick={done ? undefined : () => toggle(e.s)}
              left={
                <span onClick={(ev) => ev.stopPropagation()}>
                  <Checkbox.Line checked={on} disabled={done} size={24} aria-label={`${e.n} 고르기`} onCheckedChange={() => toggle(e.s)} />
                </span>
              }
              contents={<ListRow.Texts type="2RowTypeA" top={e.n} bottom={codeLine(e.s, e)} />}
              right={
                done ? (
                  <Text typography="t7" color={colors.grey600}>
                    담음
                  </Text>
                ) : q ? (
                  <Text typography="t7" color={colors.grey700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatPrice(q.price, unitOf(e.s, e.m), e.m === 'FX')}
                  </Text>
                ) : undefined
              }
            />
          );
        })}
      </List>

      <FixedBottomCTA
        disabled={fresh.length === 0}
        onClick={submit}
        topAccessory={
          <div style={{ padding: '0 20px 10px' }}>
            <SegmentedControl value={interval} onChange={(v) => setBarInterval(v as Interval)} aria-label="봉 단위">
              {INTERVALS.map((i) => (
                <SegmentedControl.Item key={i} value={i}>
                  {INTERVAL_LABEL[i]}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl>
          </div>
        }
      >
        {fresh.length ? `${fresh.length}개 담기` : '담을 종목 고르기'}
      </FixedBottomCTA>
    </main>
  );
}
