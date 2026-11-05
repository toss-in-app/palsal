import { colors } from '@toss/tds-colors';
import { BottomSheet, Button, SegmentedControl, Text, Top } from '@toss/tds-mobile';
import { useEffect, useRef, useState } from 'react';

import { AD_GROUPS } from '../ads/config';
import { AdBanner } from '../components/AdBanner';
import { FearGreedGauge } from '../components/FearGreedGauge';
import { Icon } from '../components/Icon';
import { Pill } from '../components/Pill';
import { TermSheet } from '../components/TermSheet';
import { symbolIndex, type ContentFile, type UniverseFile } from '../content';
import type { FearGreed, MarketPayload, MarketRow } from '../data/types';
import { formatDateLabel } from '../lib/date';
import { formatKstTime, formatPct, formatRsi, INTERVAL_LABEL } from '../lib/format';
import { zoneOf } from '../lib/indicators';
import { changeColor, PAGE_BG, zoneInk } from '../lib/palette';
import type { Interval } from '../lib/series';
import type { MarketState } from '../state/market';
import type { WatchItem } from '../state/watch';

const INTERVALS: Interval[] = ['1d', '1wk', '1mo'];

export interface MarketScreenProps {
  today: string;
  market: MarketState;
  universe: UniverseFile;
  watched: WatchItem[];
  glossary: ContentFile['glossary'];
  onRetry: () => void;
  onOpen: (symbol: string) => void;
  onAdd: (symbol: string, interval: Interval) => void;
}

const nameOf = (s: string) => symbolIndex.get(s)?.n ?? s;
const card = { background: colors.background, borderRadius: 20, boxShadow: '0 1px 2px rgba(0,27,55,.04)' } as const;

function FearGreedStrip({ fg, onInfo }: { fg: MarketPayload['fearGreed']; onInfo: () => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const items: [string, FearGreed][] = [
    ['한국 공포탐욕', fg.kr],
    ['미국 공포탐욕', fg.us],
    ['코인 공포탐욕', fg.crypto],
  ];
  const onScroll = () => {
    const el = strip.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (el && first) setPage(Math.round(el.scrollLeft / (first.offsetWidth + 10)));
  };
  return (
    <section aria-label="공포탐욕지수">
      <div ref={strip} onScroll={onScroll} style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', padding: '4px 16px 0', scrollPadding: '0 16px', scrollbarWidth: 'none' }}>
        {items.map(([title, v]) => (
          <div key={title} style={{ ...card, flex: 'none', width: 'calc(100% - 40px)', scrollSnapAlign: 'start', padding: '16px 16px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Text typography="t6" fontWeight="bold" color={colors.grey900}>
                {title}
              </Text>
              <button type="button" aria-label="공포탐욕지수 계산 방법" onClick={onInfo} style={{ border: 0, background: 'none', padding: 4, cursor: 'pointer', display: 'inline-flex', color: colors.grey500 }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 11v5" />
                  <path d="M12 7.6v.1" />
                </svg>
              </button>
              {v.attribution ? (
                <Text typography="st12" color={colors.grey500} style={{ marginLeft: 'auto' }}>
                  {v.attribution}
                </Text>
              ) : null}
            </div>
            <div style={{ marginTop: 6 }}>
              <FearGreedGauge score={v.score} label={v.label} />
            </div>
            <Text display="block" typography="st12" color={colors.grey500} style={{ textAlign: 'center', marginTop: 2 }}>
              {v.basis}
            </Text>
          </div>
        ))}
      </div>
      <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
        {items.map(([title], i) => (
          <span key={title} style={{ width: i === page ? 16 : 6, height: 6, borderRadius: 3, background: i === page ? colors.grey700 : colors.grey300 }} />
        ))}
      </div>
    </section>
  );
}

function RsiTrack({ rsi }: { rsi: number }) {
  const ink = zoneInk(zoneOf(rsi));
  return (
    <span aria-hidden="true" style={{ position: 'relative', display: 'inline-block', width: 64, height: 6, borderRadius: 3, background: colors.grey100, flex: 'none' }}>
      <span style={{ position: 'absolute', left: '30%', top: -2, width: 1, height: 10, background: colors.grey300 }} />
      <span style={{ position: 'absolute', left: '70%', top: -2, width: 1, height: 10, background: colors.grey300 }} />
      <span style={{ position: 'absolute', left: `calc(${Math.max(0, Math.min(100, rsi))}% - 5px)`, top: -2, width: 10, height: 10, borderRadius: 5, background: ink }} />
    </span>
  );
}

/** 시장(탭 2, 흐름 문서 'market'): 공포탐욕 3 · 지금 RSI 30 아래인 큰 종목 · 시가총액 순위 */
export function MarketScreen({ today, market, universe, watched, glossary, onRetry, onOpen, onAdd }: MarketScreenProps) {
  const [rankTab, setRankTab] = useState<'kr' | 'us'>('kr');
  const [term, setTerm] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [shownAdding, setShownAdding] = useState<string | null>(null);
  const [interval, setBarInterval] = useState<Interval>('1d');
  useEffect(() => {
    if (adding) setShownAdding(adding);
  }, [adding]);

  const data = market.data;
  const rows = data ? [...data.universe.kr, ...data.universe.us] : [];
  const bySymbol = new Map(rows.map((r) => [r.symbol, r] as const));
  const marketOfSymbol = (s: string) => (data?.universe.kr.some((r) => r.symbol === s) ? '한국' : '미국');
  const isWatched = (s: string) => watched.some((w) => w.symbol === s);
  const total = rows.length;
  const rank: MarketRow[] = data ? data.universe[rankTab].slice(0, 15) : [];
  const asOf = universe.asOfDate;

  return (
    <main style={{ minHeight: '100vh', background: PAGE_BG, paddingBottom: 120 }}>
      <Top style={{ background: PAGE_BG }} subtitleTop={<Top.SubtitleParagraph size={13}>{formatDateLabel(today)}</Top.SubtitleParagraph>} title={<Top.TitleParagraph size={22}>시장</Top.TitleParagraph>} />

      {!data && market.status === 'error' ? (
        <section style={{ ...card, margin: '8px 20px 0', padding: '28px 20px 20px', textAlign: 'center' }}>
          <Text display="block" typography="t6" color={colors.grey700}>
            시장 정보를 불러오지 못했어요
          </Text>
          <Button size="small" variant="weak" style={{ marginTop: 10 }} onClick={onRetry}>
            다시 시도
          </Button>
        </section>
      ) : !data ? (
        <div aria-label="시장 정보를 불러오는 중" style={{ margin: '4px 16px 0' }}>
          <span aria-hidden="true" style={{ ...card, display: 'block', height: 210 }} />
          <span aria-hidden="true" style={{ ...card, display: 'block', height: 240, marginTop: 12 }} />
        </div>
      ) : (
        <>
          <FearGreedStrip fg={data.fearGreed} onInfo={() => setTerm('fear-greed')} />

          <section aria-label="지금 RSI 30 아래인 큰 종목" style={{ ...card, margin: '16px 16px 0', padding: '16px 0 6px' }}>
            <div style={{ padding: '0 18px 6px' }}>
              <Text display="block" typography="t5" fontWeight="bold" color={colors.grey900}>
                지금 RSI 30 아래인 큰 종목
              </Text>
              <Text display="block" typography="st12" color={colors.grey500} style={{ marginTop: 2 }}>
                {`한국·미국 시가총액 상위 ${total}개 중 · 일봉 RSI 14`}
              </Text>
            </div>
            {data.low.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {data.low.map((s) => {
                  const r = bySymbol.get(s);
                  const done = isWatched(s);
                  return (
                    <li key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 0 18px', minHeight: 56, borderTop: `1px solid ${colors.grey100}` }}>
                      <button type="button" onClick={() => onOpen(s)} style={{ flex: 1, minWidth: 0, border: 0, background: 'none', padding: '8px 0', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>
                        <Text display="block" typography="t6" fontWeight="semibold" color={colors.grey900} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {nameOf(s)}
                        </Text>
                        <Text display="block" typography="st12" color={colors.grey500} style={{ marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                          {`${marketOfSymbol(s)}${r?.rsi !== null && r?.rsi !== undefined ? ` · RSI ${formatRsi(r.rsi)}` : ''}`}
                        </Text>
                      </button>
                      <Button size="small" variant="weak" disabled={done} onClick={() => setAdding(s)}>
                        {done ? '담음' : '담기'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Text display="block" typography="t7" color={colors.grey600} style={{ padding: '10px 18px 12px' }}>
                지금은 RSI 30 아래인 큰 종목이 없어요
              </Text>
            )}
          </section>

          {/* 배너 광고 banner-market: '지금 RSI 30 아래인 큰 종목' 뒤 1개 — 계약 events.md */}
          <div style={{ margin: '16px 16px 0' }}>
            <AdBanner adGroupId={AD_GROUPS.bannerMarket} />
          </div>

          <section aria-label="시가총액 순위" style={{ ...card, margin: '16px 16px 0', padding: '16px 0 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px 10px' }}>
              <Text typography="t5" fontWeight="bold" color={colors.grey900}>
                시가총액 순위
              </Text>
              <div role="group" aria-label="시장" style={{ display: 'flex', gap: 6 }}>
                <Pill on={rankTab === 'kr'} onClick={() => setRankTab('kr')}>
                  한국
                </Pill>
                <Pill on={rankTab === 'us'} onClick={() => setRankTab('us')}>
                  미국
                </Pill>
              </div>
            </div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rank.map((r) => (
                <li key={r.symbol}>
                  <button
                    type="button"
                    onClick={() => onOpen(r.symbol)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', border: 0, background: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
                  >
                    <Text typography="t7" fontWeight="bold" color={colors.grey500} style={{ width: 20, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                      {r.rank}
                    </Text>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <Text display="block" typography="t6" fontWeight="semibold" color={colors.grey900} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {nameOf(r.symbol)}
                      </Text>
                      {r.changePct !== null ? (
                        <Text display="block" typography="st12" color={changeColor(r.changePct)} style={{ marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                          {formatPct(r.changePct)}
                        </Text>
                      ) : null}
                    </span>
                    {r.rsi !== null ? (
                      <>
                        <RsiTrack rsi={r.rsi} />
                        <Text typography="t7" fontWeight="bold" color={zoneInk(zoneOf(r.rsi))} style={{ width: 40, textAlign: 'right', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                          {formatRsi(r.rsi)}
                        </Text>
                      </>
                    ) : null}
                    <Icon name="chev" size={16} color={colors.grey400} />
                  </button>
                </li>
              ))}
            </ol>
            <Text display="block" typography="st12" color={colors.grey500} style={{ padding: '6px 18px 4px' }}>
              {`${rank.length}위까지 · ${Number(asOf.slice(5, 7))}월 ${Number(asOf.slice(8, 10))}일 기준 순위 · 오른쪽 숫자는 일봉 RSI 14`}
            </Text>
          </section>

          <Text display="block" typography="st12" color={colors.grey500} style={{ margin: '14px 24px 0' }}>
            {`30분마다 다시 계산해요 · ${formatKstTime(Date.parse(data.computedAt))} 기준`}
          </Text>
        </>
      )}

      <BottomSheet
        open={adding !== null}
        onClose={() => setAdding(null)}
        aria-label="내 종목에 담기"
        cta={
          <BottomSheet.CTA
            onClick={() => {
              if (adding) onAdd(adding, interval);
              setAdding(null);
            }}
          >
            {`${INTERVAL_LABEL[interval]}으로 담기`}
          </BottomSheet.CTA>
        }
      >
        <div style={{ padding: '4px 24px 12px' }}>
          <Text display="block" typography="t4" fontWeight="bold" color={colors.grey900}>
            {shownAdding ? `${nameOf(shownAdding)} 담기` : '담기'}
          </Text>
          <Text display="block" typography="t7" color={colors.grey600} style={{ margin: '6px 0 14px' }}>
            어떤 봉으로 볼지 골라 주세요
          </Text>
          <SegmentedControl value={interval} onChange={(v) => setBarInterval(v as Interval)} aria-label="봉 단위">
            {INTERVALS.map((i) => (
              <SegmentedControl.Item key={i} value={i}>
                {INTERVAL_LABEL[i]}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl>
        </div>
      </BottomSheet>

      <TermSheet glossary={glossary} term={term} onChange={setTerm} />
    </main>
  );
}
